"""History API router."""

from typing import Optional
from fastapi import APIRouter, Query
from ..schemas import HistoryResponse, FairnessMetrics, EmployeeStats
from ..storage import storage

router = APIRouter(prefix="/history", tags=["history"])


@router.get("", response_model=HistoryResponse)
async def get_history(shift_type: Optional[str] = Query(None)):
    """Get historical assignment data, optionally filtered by shift type."""
    monthly = storage.get_monthly_summaries(shift_type=shift_type)
    employee_stats = storage.get_employee_stats(shift_type=shift_type)

    return HistoryResponse(
        monthly_assignments=monthly,
        employee_stats=[
            EmployeeStats(
                id=s["id"],
                name=s["name"],
                is_active=s.get("is_active", True),
                is_new=s.get("is_new", True),
                total_shifts=s["total_shifts"],
                shifts_by_type=s.get("shifts_by_type"),
                months_active=s.get("months_active", 0),
                last_shift_date=s.get("last_shift_date"),
            )
            for s in employee_stats
        ],
    )


@router.get("/fairness", response_model=FairnessMetrics)
async def get_fairness_metrics(shift_type: Optional[str] = Query(None)):
    """Get fairness metrics for shift distribution, optionally filtered by shift type."""
    stats = storage.get_employee_stats(shift_type=shift_type)

    if not stats:
        return FairnessMetrics(
            average_shifts=0,
            median_shifts=0,
            std_deviation=0,
            min_shifts=0,
            max_shifts=0,
            fairness_score=100,
            employees=[],
        )

    # Calculate statistics
    shifts = [s["total_shifts"] for s in stats]
    avg = sum(shifts) / len(shifts) if shifts else 0

    # Calculate median
    sorted_shifts = sorted(shifts)
    n = len(sorted_shifts)
    if n == 0:
        median = 0
    elif n % 2 == 1:
        median = sorted_shifts[n // 2]
    else:
        median = (sorted_shifts[n // 2 - 1] + sorted_shifts[n // 2]) / 2

    # Median Absolute Deviation (MAD) - more robust than std deviation
    mad = 0
    if shifts and median > 0:
        absolute_deviations = [abs(s - median) for s in shifts]
        sorted_deviations = sorted(absolute_deviations)
        if n % 2 == 1:
            mad = sorted_deviations[n // 2]
        else:
            mad = (sorted_deviations[n // 2 - 1] + sorted_deviations[n // 2]) / 2

    # Standard deviation (kept for display)
    variance = sum((s - avg) ** 2 for s in shifts) / len(shifts) if shifts else 0
    std_dev = variance ** 0.5

    min_shifts = min(shifts) if shifts else 0
    max_shifts = max(shifts) if shifts else 0

    # Fairness score: 100 = perfectly fair, lower = less fair
    # Uses MAD normalized by median for robustness against outliers
    cv = mad / median if median > 0 else 0
    fairness_score = max(0, 100 - (cv * 100))

    return FairnessMetrics(
        average_shifts=round(avg, 2),
        median_shifts=round(median, 2),
        std_deviation=round(std_dev, 2),
        min_shifts=min_shifts,
        max_shifts=max_shifts,
        fairness_score=round(fairness_score, 1),
        employees=[
            EmployeeStats(
                id=s["id"],
                name=s["name"],
                is_active=s.get("is_active", True),
                is_new=s.get("is_new", True),
                total_shifts=s["total_shifts"],
                shifts_by_type=s.get("shifts_by_type"),
                months_active=s.get("months_active", 0),
                last_shift_date=s.get("last_shift_date"),
            )
            for s in stats
        ],
    )


@router.get("/monthly")
async def get_monthly_history(shift_type: Optional[str] = Query(None)):
    """Get monthly breakdown of assignments, optionally filtered by shift type."""
    summaries = storage.get_monthly_summaries(shift_type=shift_type)

    # Get detailed data for each month
    detailed = []
    for summary in summaries:
        month_data = storage.get_month_assignment(summary["month_year"])
        if month_data:
            detailed.append({
                "month_year": summary["month_year"],
                "total_shifts": summary["total_shifts"],
                "employees_count": summary["employees_count"],
                "by_type": summary.get("by_type"),
                "shift_counts": month_data.get("shift_counts", {}),
                "created_at": month_data.get("created_at"),
            })

    return {"months": detailed}


@router.get("/employee-trends")
async def get_employee_trends(shift_type: Optional[str] = Query(None)):
    """Get shift trends per employee over time, optionally filtered by shift type."""
    stats = storage.get_employee_stats(shift_type=shift_type)
    all_assignments = storage.get_assignments()

    # Filter assignments by shift_type if provided
    if shift_type:
        all_assignments = [
            a for a in all_assignments
            if a.get("shift_type", "ect") == shift_type
        ]

    trends = []
    for emp in stats:
        emp_assignments = [
            a for a in all_assignments
            if a.get("employee_name") == emp["name"]
        ]

        # Group by month
        monthly = {}
        for a in emp_assignments:
            my = a.get("month_year", "")
            monthly[my] = monthly.get(my, 0) + 1

        trends.append({
            "employee_id": emp["id"],
            "employee_name": emp["name"],
            "total_shifts": emp["total_shifts"],
            "monthly_shifts": monthly,
        })

    return {"trends": trends}
