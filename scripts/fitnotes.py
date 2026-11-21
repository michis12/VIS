"""Reads a FitNotes backup (SQLite) into VIS workouts / exercises / weights.

Only strength sets (reps > 0) are imported; cardio and timed holds are skipped.
FitNotes has no workout names or times, so each training day becomes one workout
named after its dominant muscle groups, starting 18:00 with unknown duration.
"""
import re
import sqlite3
from collections import Counter, OrderedDict

# FitNotes name -> existing VIS exercise id (only unambiguous matches)
SAME_AS = {
    "A Cable Crunch": "cable-crunch",
    "A T-Bar Row": "t-bar-row",
    "A Peck Deck": "pec-deck-machine",
    "A Lateral Machine Raise": "lateral-raise-machine",
    "Lateral Cable Raise P": "lateral-raise-cable",
    "A Leg Press": "leg-press",
    "A Seated Leg Extantion": "leg-extension-machine",
    "A Hemstring": "hamstring-curl",
    "Adaptoren Inside": "adduktoren",
    "A Rear Delt Machine Fly": "rear-delt",
    "A Incline Dumbbell Bench Press": "incline-bench-press-dumbbell",
    "A Incline Smith Machine": "incline-bench-press-smith-machine",
    "Pull Up": "pull-up",
    "Push Ups": "push-up",
}

# cleaned display names for exercises that stay separate
RENAME = {
    "A Overhead Press": "Overhead Press (Machine)",
    "One Arm Cable Overhead": "Overhead Triceps Extension (Single Arm, Cable)",
    "A Seated Push Mid Chest": "Seated Chest Press (Mid)",
    "One Arm Cable Push Down": "Triceps Pushdown (Single Arm, Cable)",
    "A Straight-Arm Cable|Bar Pushdown": "Straight-Arm Pulldown (Cable)",
    "A Cable Hammer Curl On Body Elenbogen": "Hammer Curl (Cable)",
    "A Lower Back Stand Seat": "Back Extension (Machine)",
    "A Laying Lower Abs Raises": "Lying Leg Raise",
    "A Preacher Curl": "Preacher Curl",
    "A Lat Pulldown": "Lat Pulldown",
    "Crunch Machine": "Crunch (Machine)",
    "A V-Bar Push Down": "Triceps Pushdown (V-Bar)",
    "A Lower Chest 2 Cable Pull": "Cable Fly (Low to High)",
    "A Standing Calf Raise Machine": "Standing Calf Raise (Machine)",
    "Lateral Dumbbell Raise": "Lateral Raise (Dumbbell)",
    "A Seated Back Pull Mashine": "Seated Row (Machine)",
    "A Lads Mashine": "Lat Machine",
    "Straight Bar Push Down": "Triceps Pushdown (Straight Bar)",
    "Rear Delt Cable Tower Pull Down 45°": "Rear Delt Pulldown (Cable, 45°)",
    "Dumbbell Curl": "Bicep Curl (Dumbbell)",
    "Cable Curl Performance": "Bicep Curl (Cable, Performance)",
    "A Cable Overhead Triceps Extension": "Overhead Triceps Extension (Cable)",
    "Seated Press Upper Chest": "Seated Chest Press (Upper)",
    "Small Grip Pull Down": "Close-Grip Pulldown",
    "Rope Push Down": "Triceps Pushdown (Rope)",
    "Flat Barbell Bench Press": "Bench Press (Barbell)",
    "Hanging Knee Raise": "Hanging Knee Raise",
    "Side Weight Pulling": "Side Bend (Weighted)",
    "Incline Push Ups": "Incline Push Up",
    "Seated Butterfly Mashine": "Reverse Butterfly (Machine)",
    "A Jeverson Curl": "Jefferson Curl",
    "Weighed Crunsh": "Weighted Crunch",
    "Standing Cable High Pull down Side Rear Delt": "Rear Delt High Pull (Cable)",
    "Seated Back Pull Multi 2": "Seated Row (Multi)",
    "Dumbell Steps": "Step Up (Dumbbell)",
    "Cable Grip Gable Curl": "Bicep Curl (Cable Grip)",
    "Brust 5 Seated Round Pulldown": "Chest Machine (Round Pulldown)",
    "Back Lean Mashine": "Back Lean Machine",
    "Push Ups Diamond": "Diamond Push Up",
}

MUSCLE = {"Shoulders": "Schultern", "Chest": "Brust", "Triceps": "Trizeps", "Back": "Rücken",
          "Biceps": "Bizeps", "Abs": "Bauch", "Legs": "Beine", "Cardio": "Sonstige"}
GROUP = {"Chest": "Push", "Shoulders": "Push", "Triceps": "Push", "Back": "Pull", "Biceps": "Pull",
         "Legs": "Legs", "Abs": "Abs"}


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def clean(name: str) -> str:
    name = name.replace("�", "°")
    return RENAME.get(name, re.sub(r"^A ", "", name).strip())


def read(path: str, known_ids: set[str]):
    con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    rows = con.execute("""
        select t.date, e.name, c.name, t.metric_weight, t.reps
        from training_log t
        join exercise e on e._id = t.exercise_id
        left join Category c on c._id = e.category_id
        where t.reps > 0
        order by t.date, t._id
    """).fetchall()

    exercises: dict[str, dict] = {}
    days: "OrderedDict[str, dict]" = OrderedDict()
    for date, raw, cat, kg, reps in rows:
        raw = raw.replace("�", "°")
        ex_id = SAME_AS.get(raw)
        if ex_id is None:
            name = clean(raw)
            ex_id = slug(name)
            if ex_id not in known_ids:
                exercises.setdefault(ex_id, {"id": ex_id, "name": name, "muscle": MUSCLE.get(cat or "", "Sonstige")})
        d = days.setdefault(date, {"exercises": [], "groups": Counter()})
        block = next((e for e in d["exercises"] if e["exerciseId"] == ex_id), None)
        if block is None:
            block = {"exerciseId": ex_id, "sets": []}
            d["exercises"].append(block)
        block["sets"].append({"weight": float(kg or 0), "reps": int(reps), "done": True})
        d["groups"][GROUP.get(cat or "", "Other")] += 1

    workouts = []
    for date, d in days.items():
        top = [g for g, _ in d["groups"].most_common(2) if g != "Other"]
        total = sum(d["groups"].values())
        name = top[0] if top else "Training"
        if len(top) > 1 and d["groups"][top[1]] / total >= 0.3:
            order = ["Push", "Pull", "Legs", "Abs"]
            name = " + ".join(sorted(top, key=order.index))
        workouts.append({"id": "fitnotes-" + date.replace("-", ""), "name": name, "startedAt": f"{date}T18:00:00",
                         "durationSec": None, "status": "done", "source": "fitnotes", "exercises": d["exercises"]})

    weights = [{"date": date, "kg": round(float(v), 1), "source": "fitnotes"}
               for date, v in con.execute("select date, value from MeasurementRecord where measurement_id = 1")]
    return list(exercises.values()), workouts, weights
