"""Directory scoped to the signed-in student's current division."""
import re
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.v1.student_portal import linked_student, student_only
from backend.app.database.session import get_db
from backend.app.models.entities import Student, StudentPortalDetails, User

router = APIRouter(prefix="/student-portal", tags=["Student Portal"])


@router.get("/classmates")
async def classmates(db: AsyncSession = Depends(get_db), user: User = Depends(student_only)):
    own = await db.get(Student, await linked_student(db, user))
    if own is None or own.status != "ACTIVE":
        raise HTTPException(403, "An active student record is required to view classmates.")
    if not all(value and value.strip() for value in (own.department, own.class_name, own.section)):
        raise HTTPException(409, "Ask your administrator to complete your class assignment.")
    rows = await db.execute(
        select(Student.roll_number, Student.first_name, Student.last_name, StudentPortalDetails.roster_name)
        .outerjoin(StudentPortalDetails, StudentPortalDetails.student_id == Student.id)
        .where(Student.department == own.department, Student.class_name == own.class_name,
               Student.section == own.section, Student.status == "ACTIVE", Student.id != own.id)
    )
    ordered = sorted(rows, key=lambda row: [
        (0, int(part)) if part.isdecimal() else (1, part.casefold())
        for part in re.split(r"([0-9]+)", row.roll_number)
    ])
    return {"department": own.department, "class_name": own.class_name, "section": own.section,
            "names": [roster.strip() if roster and roster.strip() else f"{first} {last}".strip()
                      for _, first, last, roster in ordered]}
