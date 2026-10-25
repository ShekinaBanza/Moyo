<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\WorkoutProgram;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Programs: the user's own (editable) + shared templates (read-only; duplicate to edit). */
class WorkoutProgramController extends Controller
{
    private const EQUIP = 'none,dumbbells,bands,chair,wall,gym';

    private const GROUPS = 'pectoraux,dos,epaules,biceps_triceps,jambes,fessiers,corps_entier,abdominaux,mobilite';

    private function rules(): array
    {
        return [
            'name' => 'required|string|max:120',
            'goal' => 'required|in:strength,abs,mobility,fitness',
            'level' => 'required|in:beginner,intermediate,advanced',
            'target_minutes' => 'nullable|integer|between:5,240',
            'description' => 'nullable|string|max:500',
            'equipment' => 'nullable|array|max:6',
            'equipment.*' => 'in:'.self::EQUIP,
            'muscle_groups' => 'nullable|array|max:9',
            'muscle_groups.*' => 'in:'.self::GROUPS,
            'days' => 'nullable|array|max:7',
            'days.*' => 'integer|between:0,6',
            'exercises' => 'required|array|min:1|max:30',
            'exercises.*.exercise_id' => 'required|integer|exists:exercises,id',
            'exercises.*.sets' => 'required|integer|between:1,10',
            'exercises.*.reps' => 'nullable|integer|between:1,200|required_without:exercises.*.seconds',
            'exercises.*.seconds' => 'nullable|integer|between:5,900|required_without:exercises.*.reps',
            'exercises.*.rest_seconds' => 'nullable|integer|between:0,300',
        ];
    }

    private function visible(Request $request, int $id): WorkoutProgram
    {
        return WorkoutProgram::where(fn ($q) => $q->where('user_id', $request->user()->id)->orWhereNull('user_id'))->findOrFail($id);
    }

    private function mine(Request $request, int $id): WorkoutProgram
    {
        $p = WorkoutProgram::where('user_id', $request->user()->id)->find($id);
        if (! $p) {
            // templates exist but cannot be changed: say so instead of a misleading 404
            abort_if(WorkoutProgram::whereNull('user_id')->whereKey($id)->exists(), 403, 'Ce modèle n\'est pas modifiable : dupliquez-le pour créer votre propre séance.');
            abort(404);
        }

        return $p;
    }

    private function present(WorkoutProgram $p): array
    {
        $p->loadMissing('items');
        $ex = \App\Models\Exercise::whereIn('id', $p->items->pluck('exercise_id'))->get()->keyBy('id');

        return array_merge($p->toArray(), [
            'estimated_minutes' => $p->estimatedMinutes(),
            'items' => $p->items->map(fn ($i) => $i->toArray() + ['exercise' => $ex[$i->exercise_id]->only(['id', 'slug', 'name', 'category', 'muscle_group', 'level', 'kind', 'image_start', 'image_end', 'equipment'])])->values()->all(),
        ]);
    }

    private function fillItems(WorkoutProgram $p, array $items): void
    {
        $p->items()->delete();
        foreach (array_values($items) as $pos => $it) {
            $p->items()->create([
                'exercise_id' => $it['exercise_id'], 'position' => $pos, 'sets' => $it['sets'],
                'reps' => $it['reps'] ?? null, 'seconds' => $it['seconds'] ?? null, 'rest_seconds' => $it['rest_seconds'] ?? 60,
            ]);
        }
        $p->unsetRelation('items');
    }

    public function index(Request $request): JsonResponse
    {
        $list = WorkoutProgram::where(fn ($q) => $q->where('user_id', $request->user()->id)->orWhereNull('user_id'))
            ->with('items')->orderByRaw('user_id is null')->orderBy('name')->get();

        return response()->json(['data' => $list->map(fn ($p) => $this->present($p))->values()]);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        return response()->json(['data' => $this->present($this->visible($request, $id))]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules());
        $p = DB::transaction(function () use ($request, $data) {
            $p = new WorkoutProgram(collect($data)->except('exercises')->all());
            $p->user_id = $request->user()->id;
            $p->is_template = false;
            $p->save();
            $this->fillItems($p, $data['exercises']);

            return $p;
        });

        return response()->json(['data' => $this->present($p->fresh())], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $p = $this->mine($request, $id);
        $rules = array_map(fn ($r) => is_array($r) ? $r : 'sometimes|'.$r, $this->rules());
        $data = $request->validate($rules);
        DB::transaction(function () use ($p, $data) {
            $p->fill(collect($data)->except('exercises')->all())->save();
            if (isset($data['exercises'])) {
                $this->fillItems($p, $data['exercises']);
            }
        });

        return response()->json(['data' => $this->present($p->fresh())]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $this->mine($request, $id)->delete();

        return response()->json(['deleted' => true]);
    }

    /** Copy of a template (or of the user's own program) that the user can then edit. */
    public function duplicate(Request $request, int $id): JsonResponse
    {
        $src = $this->visible($request, $id)->load('items');
        $copy = DB::transaction(function () use ($request, $src) {
            $c = new WorkoutProgram($src->only(['name', 'goal', 'level', 'target_minutes', 'description', 'equipment', 'muscle_groups', 'days']));
            $c->name = mb_substr($src->name.($src->is_template ? ' (ma version)' : ' (copie)'), 0, 120);
            $c->user_id = $request->user()->id;
            $c->is_template = false;
            $c->save();
            foreach ($src->items as $i) {
                $c->items()->create($i->only(['exercise_id', 'position', 'sets', 'reps', 'seconds', 'rest_seconds']));
            }

            return $c;
        });

        return response()->json(['data' => $this->present($copy->fresh())], 201);
    }
}
