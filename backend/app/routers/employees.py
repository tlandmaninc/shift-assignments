"""Employees API router."""

from fastapi import APIRouter, HTTPException, Depends
from ..schemas import (
    EmployeeCreate,
    EmployeeUpdate,
    EmployeeResponse,
    EmployeeDuplicate,
    EmployeeMergeRequest,
    EmployeeMergeResult,
    EmployeeMergeAllResponse,
    TranslateAllResponse,
)
from ..audit import log_audit, AuditAction
from ..storage import storage
from .auth import require_admin

# All endpoints in this router require admin access
router = APIRouter(
    prefix="/employees",
    tags=["employees"],
    dependencies=[Depends(require_admin)]
)


@router.get("", response_model=list[EmployeeResponse])
async def list_employees(active_only: bool = True):
    """List all employees."""
    employees = storage.get_employees()

    if active_only:
        employees = [e for e in employees if e.get("is_active", True)]

    # Add shift counts
    shift_counts = storage.get_employee_shift_counts()
    for emp in employees:
        emp["total_shifts"] = shift_counts.get(emp.get("name", ""), 0)

    return employees


@router.get("/{employee_id}", response_model=EmployeeResponse)
async def get_employee(employee_id: int):
    """Get a specific employee."""
    employee = storage.get_employee(employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Add shift count
    shift_counts = storage.get_employee_shift_counts()
    employee["total_shifts"] = shift_counts.get(employee.get("name", ""), 0)

    return employee


@router.post("", response_model=EmployeeResponse)
async def create_employee(
    employee: EmployeeCreate,
    user: dict = Depends(require_admin),
):
    """Create a new employee."""
    # Check if employee with same name exists
    existing = storage.get_employee_by_name(employee.name)
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Employee with name '{employee.name}' already exists"
        )

    saved = storage.save_employee({
        "name": employee.name,
        "email": employee.email,
        "is_new": employee.is_new,
        "is_active": True,
        "color": employee.color,
    })

    log_audit(AuditAction.EMPLOYEE_CREATE, {
        "admin_email": user.get("email"),
        "employee_id": saved.get("id"),
        "employee_name": employee.name,
    })

    saved["total_shifts"] = 0
    return saved


@router.put("/{employee_id}", response_model=EmployeeResponse)
async def update_employee(
    employee_id: int,
    update: EmployeeUpdate,
    user: dict = Depends(require_admin),
):
    """Update an employee."""
    employee = storage.get_employee(employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Update fields
    if update.name is not None:
        employee["name"] = update.name
    if update.email is not None:
        employee["email"] = update.email
    if update.is_active is not None:
        employee["is_active"] = update.is_active
    if update.is_new is not None:
        employee["is_new"] = update.is_new
    if update.color is not None:
        employee["color"] = update.color

    saved = storage.save_employee(employee)

    log_audit(AuditAction.EMPLOYEE_UPDATE, {
        "admin_email": user.get("email"),
        "employee_id": employee_id,
    })

    # Add shift count
    shift_counts = storage.get_employee_shift_counts()
    saved["total_shifts"] = shift_counts.get(saved.get("name", ""), 0)

    return saved


@router.delete("/{employee_id}")
async def delete_employee(
    employee_id: int,
    user: dict = Depends(require_admin),
):
    """Delete (deactivate) an employee."""
    success = storage.delete_employee(employee_id)
    if not success:
        raise HTTPException(status_code=404, detail="Employee not found")

    log_audit(AuditAction.EMPLOYEE_DELETE, {
        "admin_email": user.get("email"),
        "employee_id": employee_id,
    })

    return {"success": True, "message": "Employee deactivated"}


@router.get("/{employee_id}/assignments")
async def get_employee_assignments(employee_id: int):
    """Get all assignments for an employee."""
    employee = storage.get_employee(employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    all_assignments = storage.get_assignments()
    emp_assignments = [
        a for a in all_assignments
        if a.get("employee_name") == employee.get("name")
    ]

    return {
        "employee": employee,
        "assignments": emp_assignments,
        "total": len(emp_assignments),
    }


@router.get("/{employee_id}/stats")
async def get_employee_stats(employee_id: int):
    """Get statistics for an employee."""
    stats = storage.get_employee_stats()

    emp_stats = next(
        (s for s in stats if s.get("id") == employee_id),
        None
    )

    if not emp_stats:
        raise HTTPException(status_code=404, detail="Employee not found")

    return emp_stats


@router.get("/duplicates/find", response_model=list[EmployeeDuplicate])
async def find_duplicate_employees():
    """
    Find potential duplicate employees (Hebrew/English pairs).

    Returns a list of employee pairs where a Hebrew name has a
    matching English translation in the system.
    """
    duplicates = storage.find_duplicate_employees()

    # Add shift counts to employee objects
    shift_counts = storage.get_employee_shift_counts()

    for dup in duplicates:
        heb_emp = dup["hebrew_employee"]
        eng_emp = dup["english_employee"]
        heb_emp["total_shifts"] = shift_counts.get(heb_emp.get("name", ""), 0)
        eng_emp["total_shifts"] = shift_counts.get(eng_emp.get("name", ""), 0)

    return duplicates


@router.post("/merge", response_model=EmployeeMergeResult)
async def merge_employees(
    request: EmployeeMergeRequest,
    user: dict = Depends(require_admin),
):
    """
    Merge one employee into another.

    The source employee will be deactivated and all their assignments
    will be transferred to the target employee.
    """
    try:
        result = storage.merge_employees(
            source_id=request.source_id,
            target_id=request.target_id,
            keep_target_name=True
        )
        log_audit(AuditAction.EMPLOYEE_MERGE, {
            "admin_email": user.get("email"),
            "source_id": request.source_id,
            "target_id": request.target_id,
        })
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/merge/all-hebrew", response_model=EmployeeMergeAllResponse)
async def merge_all_hebrew_employees(
    user: dict = Depends(require_admin),
):
    """
    Find all Hebrew employees with English equivalents and merge them.

    This will:
    1. Find all Hebrew employee names that have English translations
    2. Check if an employee with the English name already exists
    3. Merge the Hebrew entry into the English entry
    4. Transfer all assignments to the English name
    5. Deactivate the Hebrew name entries
    """
    result = storage.translate_and_merge_hebrew_employees()
    log_audit(AuditAction.EMPLOYEE_MERGE, {
        "admin_email": user.get("email"),
        "action": "merge_all_hebrew",
        "merges_performed": result.get("merges_performed", 0),
    })
    return result


@router.post("/translate/all-to-english", response_model=TranslateAllResponse)
async def translate_all_to_english(
    user: dict = Depends(require_admin),
):
    """
    Translate ALL Hebrew names to English throughout the entire system.

    This comprehensive operation will:
    1. First merge any duplicate employees (Hebrew + English entries)
    2. Rename remaining Hebrew employee names to English
    3. Update ALL history records with English names
    4. Update ALL monthly assignment files with English names

    Use this to fully convert the system to English names.
    Names that cannot be translated (not in dictionary) will be reported.
    """
    try:
        result = storage.translate_all_hebrew_to_english()
        log_audit(AuditAction.EMPLOYEE_TRANSLATE, {
            "admin_email": user.get("email"),
            "total_translations": result.get("total_translations", 0),
        })
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
