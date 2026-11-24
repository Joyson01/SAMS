from backend.app.services.audit_service import AuditService
import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from backend.app.api.v1.classroom import ClassNoteInput, GroupMessageInput, PostInput, SubmissionInput, board, group_messages, publish, review_submissions, send_group_message, share_note, turn_in
from backend.app.models.entities import ClassSection, Student, TeacherClassAssignment, User, UserStudentLink


@pytest.mark.asyncio
async def test_classroom_stream_is_scoped(test_db_session):
    db = test_db_session
    first = ClassSection(id="first", name="TE-B", department="Computer Engineering")
    second = ClassSection(id="second", name="TE-A", department="Mechanical")
    users = [User(id=role, username=role, email=f"{role}@school.test", full_name=role,
                  role=role, password_hash="unused", department=first.department)
             for role in ("ADMIN", "HOD", "FACULTY", "STUDENT")]
    admin, hod, faculty, student_user = users
    student = Student(id="sid", student_code="P1", roll_number="1", first_name="A", last_name="B",
                      email="sid@school.test", department=first.department, class_name=first.name, section="B")
    db.add_all([first, second, student, *users])
    await db.flush()
    db.add_all([UserStudentLink(user_id=student_user.id, student_id=student.id),
                TeacherClassAssignment(teacher_id=faculty.id, class_id=first.id)])
    await db.flush()
    payload = PostInput(class_id=first.id, kind="assignment", title="Read chapter one", body="Pages 1–5.")
    post = await publish(payload, faculty, db)
    other = payload.model_copy(update={"class_id": second.id, "title": "Other class"})
    outside = await publish(other, admin, db)
    answer = SubmissionInput(answer="  My work  ")
    with pytest.raises(ValidationError):
        SubmissionInput(answer=" ")
    receipt = await turn_in(post["id"], answer, student_user, db)
    assert receipt["answer"] == "My work"
    assert await turn_in(post["id"], answer, student_user, db) == receipt
    with pytest.raises(HTTPException) as conflict:
        await turn_in(post["id"], SubmissionInput(answer="changed"), student_user, db)
    assert conflict.value.status_code == 409
    assert (await board(student_user, db))["posts"][0]["my_submission"] == receipt
    peer = User(id="peer", username="peer", email="peer@school.test", full_name="Peer",
                role="STUDENT", password_hash="unused", department=first.department)
    peer_student = Student(id="peer-sid", student_code="P2", roll_number="2", first_name="C", last_name="D",
                           email="peer-student@school.test", department=first.department, class_name=first.name, section="B")
    db.add_all([peer, peer_student])
    await db.flush()
    db.add(UserStudentLink(user_id=peer.id, student_id=peer_student.id))
    await db.flush()
    assert (await board(peer, db))["posts"][0]["my_submission"] is None
    submissions = await review_submissions(post["id"], faculty, db)
    assert len(submissions) == 1 and submissions[0]["student_id"] == student.id
    with pytest.raises(HTTPException) as unavailable:
        await review_submissions(outside["id"], faculty, db)
    assert unavailable.value.status_code == 404
    with pytest.raises(HTTPException) as unavailable:
        await turn_in(outside["id"], answer, student_user, db)
    assert unavailable.value.status_code == 404
    for scoped_user in (hod, faculty):
        with pytest.raises(HTTPException) as rejected:
            await publish(other, scoped_user, db)
        assert rejected.value.status_code == 403
    for scoped_user in (hod, faculty, student_user):
        stream = await board(scoped_user, db)
        assert [p["title"] for p in stream["posts"]] == [payload.title]
        assert stream["can_publish"] == (scoped_user != student_user)
    with pytest.raises(HTTPException) as forbidden_note:
        await share_note(ClassNoteInput(class_id=second.id, title="Notes", body="Out of scope"), student_user, db)
    assert forbidden_note.value.status_code == 403
    note = await share_note(ClassNoteInput(class_id=first.id, title="Chapter one notes", body="  Key terms  "), student_user, db)
    peer_posts = (await board(peer, db))["posts"]
    shared = next(item for item in peer_posts if item["id"] == note["id"])
    assert (shared["kind"], shared["author"], shared["body"]) == ("material", student_user.full_name, "Key terms")
    message = await send_group_message(first.id, GroupMessageInput(body="  Hello TE-B  "), student_user, db)
    assert message["mine"]
    peer_messages = await group_messages(first.id, peer, db)
    assert len(peer_messages) == 1
    assert (peer_messages[0]["body"], peer_messages[0]["author"], peer_messages[0]["mine"]) == ("Hello TE-B", student_user.full_name, False)
    assert all(item["id"] != message["id"] for item in (await board(peer, db))["posts"])
    with pytest.raises(HTTPException) as forbidden_group:
        await send_group_message(second.id, GroupMessageInput(body="Out of scope"), student_user, db)
    assert forbidden_group.value.status_code == 403
    await db.flush()
    events, count = await AuditService.list_audit_logs(db, student_activity=True)
    assert count == 3
    assert {entry.action for entry in events} == {"STUDENT_TURN_IN_ASSIGNMENT", "STUDENT_SHARE_NOTE", "STUDENT_SEND_GROUP_MESSAGE"}
    assert all(entry.user_id == student_user.id and entry.old_values is None for entry in events)
    assert {entry.action: entry.new_values for entry in events} == {
        "STUDENT_TURN_IN_ASSIGNMENT": None,
        "STUDENT_SHARE_NOTE": {"class_id": first.id},
        "STUDENT_SEND_GROUP_MESSAGE": {"class_id": first.id},
    }
    student.section = "A"
    await db.flush()
    assert not (await board(student_user, db))["posts"]
    with pytest.raises(HTTPException) as hidden_group:
        await group_messages(first.id, student_user, db)
    assert hidden_group.value.status_code == 403
    student.section = "B"
    student.department = second.department
    await db.flush()
    assert not (await board(student_user, db))["posts"]
    assert len((await board(admin, db))["posts"]) == 3


def test_rejects_other_links_and_material_deadlines():
    fields = dict(class_id="c", kind="material", title="Week 1", body="Notes")
    for extra in [{"classroom_url": "https://classroom.google.com.example.com/"}, {"due_date": "2027-02-02"}]:
        with pytest.raises(ValidationError):
            PostInput(**fields, **extra)
