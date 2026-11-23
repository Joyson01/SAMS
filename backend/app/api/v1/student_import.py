"""Validate and import student rosters from CSV and Excel workbooks."""

import csv
import io
from pathlib import Path
from zipfile import BadZipFile, ZipFile

from openpyxl import load_workbook
from openpyxl.utils.exceptions import InvalidFileException

from starlette.concurrency import run_in_threadpool

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.exceptions import StudentAlreadyExistsError
from backend.app.core.security import require_roles
from backend.app.database.session import get_db
from backend.app.models.entities import ClassSection, Student, User
from backend.app.schemas.student import StudentCreate
from backend.app.services.student_service import StudentService

router = APIRouter(prefix="/students", tags=["Student Management"])
REQUIRED = ("student_code", "roll_number", "first_name", "last_name", "email", "department", "class_name")
IDENTIFIERS = ("student_code", "roll_number", "email")
OPTIONAL = ("section", "status")
MAX_SIZE = 1024 * 1024
MAX_ROWS = 500


class ImportIssue(BaseModel):
    row: int
    message: str


class ImportResult(BaseModel):
    ready: int
    imported: int = 0
    errors: list[ImportIssue]


def parse_roster(raw: bytes) -> tuple[list[tuple[int, StudentCreate]], list[ImportIssue]]:
    rows, errors = [], []
    try:
        reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig"), newline=""), strict=True)
        fields = reader.fieldnames or []
        if not set(REQUIRED).issubset(fields) or len(fields) != len(set(fields)):
            raise HTTPException(422, "Use the template with a single header for each required column.")
        for row_number, row in enumerate(reader, start=2):
            if row_number > MAX_ROWS + 1:
                raise HTTPException(422, f"Use at most {MAX_ROWS} students per file.")
            if None in row:
                errors.append(ImportIssue(row=row_number, message="Unexpected values beyond the header."))
                continue
            data = {key: row[key] for key in REQUIRED}
            data.update({key: row[key] for key in OPTIONAL if row.get(key)})
            try:
                rows.append((row_number, StudentCreate.model_validate(data)))
            except ValidationError as error:
                fields = ", ".join(str(item["loc"][0]) for item in error.errors())
                errors.append(ImportIssue(row=row_number, message=f"Check these fields: {fields}."))
    except (UnicodeDecodeError, csv.Error) as error:
        raise HTTPException(422, "Upload a valid UTF-8 CSV file.") from error
    if not rows and not errors:
        raise HTTPException(422, "Add at least one student row.")
    return rows, errors


def workbook_as_csv(raw: bytes) -> bytes:
    """Convert only the first sheet, within the roster size limits."""
    source = io.BytesIO(raw)
    try:
        with ZipFile(source) as archive:
            parts = archive.infolist()
            if len(parts) > 100 or sum(part.file_size for part in parts) > 16 * MAX_SIZE:
                raise HTTPException(413, "The expanded Excel workbook is too large.")
        book = load_workbook(source, read_only=True, keep_links=False)
    except (BadZipFile, InvalidFileException, KeyError, ValueError) as error:
        raise HTTPException(422, "Upload a valid .xlsx workbook.") from error
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    try:
        if not book.worksheets:
            raise HTTPException(422, "The workbook needs a worksheet with student rows.")
        first = book.worksheets[0]
        for row_index, row in enumerate(first.iter_rows(max_col=25), start=1):
            if row_index > MAX_ROWS + 1:
                raise HTTPException(422, f"Use at most {MAX_ROWS} students per file.")
            if any(cell.data_type == "f" for cell in row):
                raise HTTPException(422, f"Replace Excel formulas with values on row {row_index}.")
            values = [cell.value for cell in row]
            while values and values[-1] is None:
                values.pop()
            if values:
                writer.writerow(values)
    finally:
        book.close()
    return output.getvalue().encode("utf-8")


@router.post("/import-roster", response_model=ImportResult)
async def import_roster(
    file: UploadFile = File(...),
    dry_run: bool = Query(True),
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_roles("ADMIN", "OPERATOR")),
):
    data = await file.read(MAX_SIZE + 1)
    if len(data) > MAX_SIZE:
        raise HTTPException(413, "The roster file must be 1 MB or smaller.")
    extension = Path(file.filename or "").suffix.lower()
    if extension == ".xlsx":
        data = await run_in_threadpool(workbook_as_csv, data)
    elif extension != ".csv":
        raise HTTPException(415, "Upload a .csv or .xlsx file.")
    rows, errors = parse_roster(data)
    classes = dict((await db.execute(select(ClassSection.name, ClassSection.department))).all())
    seen = {}
    for key in IDENTIFIERS:
        column = getattr(Student, key)
        values = {getattr(payload, key) for _, payload in rows}
        seen[key] = set(await db.scalars(select(column).where(column.in_(values))))

    ready = []
    for number, payload in rows:
        issues = [key for key in IDENTIFIERS if getattr(payload, key) in seen[key]]
        for key in IDENTIFIERS:
            seen[key].add(getattr(payload, key))
        if issues:
            errors.append(ImportIssue(row=number, message=f"Duplicate fields: {', '.join(issues)}."))
        elif classes.get(payload.class_name) != payload.department:
            errors.append(ImportIssue(row=number, message="Class and department must match an existing class."))
        else:
            ready.append(payload)

    result = ImportResult(ready=len(ready), errors=sorted(errors, key=lambda issue: issue.row))
    if dry_run or errors:
        return result
    try:
        for payload in ready:
            await StudentService.create_student(db, payload, user_id=actor.id, commit=False)
        await db.commit()
    except (IntegrityError, StudentAlreadyExistsError) as error:
        await db.rollback()
        raise HTTPException(409, "Student records changed. Preview the roster again before importing.") from error
    result.imported = len(ready)
    return result
