<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityCatalogItem;
use App\Models\ActivityEntry;
use App\Models\Exercise;
use App\Models\WorkoutProgram;
use App\Models\WorkoutSession;
use App\Services\EnergyService;
use App\Services\WorkoutService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** Sessions really performed by the authenticated user. Everything is scoped to the owner. */
class WorkoutSessionController extends Controller
{
    public function __construct(private WorkoutService $workouts) {}

    private function owned(Request $request, int $id): WorkoutSession
    {
        $s = WorkoutSession::where('user_id', $request->user()->id)->findOrFail($id);
        $this->authorize('view', $s);

        return $s;
    }

    private function present(WorkoutSession $s, Request $request): array
    {
        $s->loadMissing('items');
        $est = $s->calories_est !== null || $s->met !== null ? ['net_kcal' => $s->calories_est, 'met' => $s->met, 'method' => $s->calories_method] : null;

        return $s->toArray() + ['estimate' => $est];
    }

    public function index(Request $request): JsonResponse
    {
        $list = WorkoutSession::where('user_id', $request->user()->id)->with('items')->orderByDesc('started_at')->limit(min(300, (int) $request->query('limit', 100)))->get();

        return response()->json(['data' => $list->map(fn ($s) => $this->present($s, $request))->values()]);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        return response()->json(['data' => $this->present($this->owned($request, $id), $request)]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'client_id' => 'nullable|string|max:64',
            'program_id' => 'nullable|integer',
            'name' => 'required|string|max:120',
            'started_at' => 'required|date',
            'ended_at' => 'required|date|after:started_at',
            'effective_seconds' => 'required|integer|between:1,14400',
            'status' => 'nullable|in:finished,stopped',
            'perceived_difficulty' => 'nullable|integer|between:1,5',
            'notes' => 'nullable|string|max:2000',
            'exercises' => 'required|array|min:1|max:40',
            'exercises.*.exercise_id' => 'required|integer|exists:exercises,id',
            'exercises.*.planned_sets' => 'nullable|integer|between:0,10',
            'exercises.*.skipped' => 'nullable|boolean',
            'exercises.*.sets' => 'nullable|array|max:10',
            'exercises.*.sets.*.reps' => 'nullable|integer|between:0,500',
            'exercises.*.sets.*.seconds' => 'nullable|integer|between:0,3600',
        ]);
        $user = $request->user();

        if (! empty($data['client_id']) && ($dup = WorkoutSession::where('user_id', $user->id)->where('client_id', $data['client_id'])->first())) {
            return response()->json(['data' => $this->present($dup, $request), 'duplicate' => true]);
        }
        $started = Carbon::parse($data['started_at']);
        $ended = Carbon::parse($data['ended_at']);
        if ($data['effective_seconds'] > $started->diffInSeconds($ended) + 5) {
            throw ValidationException::withMessages(['effective_seconds' => ["La durée effective ne peut pas dépasser le temps écoulé entre le début et la fin."]]);
        }
        if (! empty($data['program_id'])) {
            // a session can reference a program only if it is the user's own or a shared template
            abort_unless(WorkoutProgram::where(fn ($q) => $q->where('user_id', $user->id)->orWhereNull('user_id'))->whereKey($data['program_id'])->exists(), 422, 'Programme introuvable.');
        }

        $exercises = Exercise::whereIn('id', collect($data['exercises'])->pluck('exercise_id'))->get()->keyBy('id');
        // Safety gate (server side): symptoms declared by the user decide, not the interface.
        $access = $this->workouts->access($user);
        $blocked = collect($exercises)->contains(fn ($e) => ! in_array($e->category, $access['allowed_categories'], true));
        if ($access['mode'] === 'blocked') {
            return response()->json(['message' => "Séance non enregistrée : des signes d'alerte sont déclarés. Cherchez une aide médicale urgente.", 'code' => 'exercise_blocked', 'access' => $access], 403);
        }
        if ($blocked) {
            return response()->json(['message' => "Cette séance contient des exercices non proposés tant que des symptômes d'alerte n'ont pas été évalués par un professionnel de santé.", 'code' => 'exercise_restricted', 'access' => $access], 403);
        }

        $est = $this->workouts->estimate($user, $this->workouts->catalogSlugFor($exercises->values()), $data['effective_seconds'], $started);

        $session = DB::transaction(function () use ($user, $data, $exercises, $est) {
            $s = new WorkoutSession(collect($data)->except('exercises')->all());
            $s->user_id = $user->id;
            $s->status = $data['status'] ?? 'finished';
            $s->met = $est['met'];
            $s->calories_est = $est['net_kcal'];
            $s->calories_method = $est['method'];
            $s->save();
            foreach (array_values($data['exercises']) as $pos => $row) {
                $s->items()->create([
                    'exercise_id' => $row['exercise_id'], 'name' => $exercises[$row['exercise_id']]->name, 'position' => $pos,
                    'planned_sets' => $row['planned_sets'] ?? 0, 'sets' => $row['sets'] ?? [], 'skipped' => $row['skipped'] ?? false,
                ]);
            }

            return $s;
        });

        return response()->json(['data' => $this->present($session->fresh(), $request)], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $s = $this->owned($request, $id);
        $this->authorize('update', $s);
        $s->fill($request->validate(['perceived_difficulty' => 'nullable|integer|between:1,5', 'notes' => 'nullable|string|max:2000', 'name' => 'sometimes|string|max:120']))->save();

        return response()->json(['data' => $this->present($s->fresh(), $request)]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $s = $this->owned($request, $id);
        $this->authorize('delete', $s);
        $s->delete(); // the journal activity, if any, is kept (it was a separate user decision)

        return response()->json(['deleted' => true]);
    }

    /**
     * Records the session in the activity journal (and therefore the energy balance), only on explicit request.
     * Possible double counting (an overlapping activity already logged by hand, GPS or watch) must be
     * resolved by the user: on_duplicate = skip | keep_both | replace (replace only deletes manual entries).
     */
    public function logActivity(Request $request, int $id, EnergyService $energy): JsonResponse
    {
        $s = $this->owned($request, $id);
        $this->authorize('update', $s);
        $data = $request->validate(['on_duplicate' => 'nullable|in:skip,keep_both,replace']);
        $user = $request->user();

        if ($s->activity_entry_id && ActivityEntry::where('user_id', $user->id)->whereKey($s->activity_entry_id)->exists()) {
            return response()->json(['message' => 'Cette séance est déjà enregistrée dans votre journal.', 'code' => 'already_logged'], 409);
        }
        $conflicts = $this->workouts->overlapping($user, $s);
        $names = ActivityCatalogItem::pluck('name', 'id');
        if ($conflicts->isNotEmpty() && empty($data['on_duplicate'])) {
            return response()->json([
                'message' => 'Une activité enregistrée se chevauche avec cette séance. Choisissez comment éviter de compter deux fois la même dépense.',
                'code' => 'possible_duplicate',
                'conflicts' => $conflicts->map(fn ($a) => ['id' => $a->id, 'name' => $a->custom_label ?: ($names[$a->catalog_id] ?? $a->activity_type), 'source_type' => $a->source_type, 'started_at' => $a->started_at, 'duration_minutes' => $a->duration_minutes])->all(),
            ], 409);
        }
        $mode = $data['on_duplicate'] ?? 'keep_both';
        if ($mode === 'skip') {
            return response()->json(['data' => $this->present($s, $request), 'logged' => false, 'message' => "Rien n'a été ajouté : l'activité existante est conservée."]);
        }
        if ($mode === 'replace') {
            $nonManual = $conflicts->where('source_type', '!=', 'manual');
            if ($nonManual->isNotEmpty()) {
                return response()->json(['message' => 'Les activités issues du GPS ou d\'une montre ne sont pas remplacées automatiquement. Choisissez « garder les deux » ou « ne rien ajouter ».', 'code' => 'cannot_replace_detected'], 422);
            }
            ActivityEntry::where('user_id', $user->id)->whereIn('id', $conflicts->pluck('id'))->delete();
        }

        $exercises = Exercise::whereIn('id', $s->items->pluck('exercise_id')->filter())->get();
        $slug = $this->workouts->catalogSlugFor($exercises);
        $cat = ActivityCatalogItem::where('slug', $slug)->first();
        $entry = new ActivityEntry([
            'catalog_id' => $cat->id, 'activity_type' => $cat->activity_type, 'started_at' => $s->started_at,
            'duration_minutes' => max(1, (int) ceil($s->effective_seconds / 60)), 'source_type' => 'manual',
            'perceived_effort' => $s->perceived_difficulty ? $s->perceived_difficulty * 2 : null,
            'notes' => 'Séance Moyo : '.$s->name,
        ]);
        $entry->user_id = $user->id;
        $entry->save();
        $s->forceFill(['activity_entry_id' => $entry->id])->save();

        $estimate = $energy->estimateEntries($user, collect([$entry]))[$entry->id] ?? null;

        return response()->json(['data' => $this->present($s->fresh(), $request), 'logged' => true, 'activity' => $entry, 'estimate' => $estimate], 201);
    }
}
