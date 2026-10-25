<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * CRUD for records owned by the authenticated user.
 * - the owner always comes from the session, never from the request body;
 * - every lookup is scoped by user_id (foreign ids give 404) AND passes the policy;
 * - a client_id makes creation idempotent (offline retries do not duplicate).
 */
abstract class OwnedCrudController extends Controller
{
    /** @var class-string<Model> */
    protected string $modelClass;

    protected string $dateColumn;

    abstract protected function rules(Request $request): array;

    /** Hook to derive/normalise fields. $existing is null on creation. */
    protected function prepare(array $data, ?Model $existing): array
    {
        return $data;
    }

    protected function updateRules(Request $request): array
    {
        $rules = $this->rules($request);
        unset($rules['client_id']);

        return array_map(fn ($r) => is_array($r) ? array_merge(['sometimes'], $r) : 'sometimes|'.$r, $rules);
    }

    protected function findOwned(Request $request, int|string $id): Model
    {
        return ($this->modelClass)::query()->where('user_id', $request->user()->id)->findOrFail($id);
    }

    public function index(Request $request): JsonResponse
    {
        $q = ($this->modelClass)::query()->where('user_id', $request->user()->id);
        if ($from = $request->query('from')) {
            $q->where($this->dateColumn, '>=', $from);
        }
        if ($to = $request->query('to')) {
            $q->where($this->dateColumn, '<=', $to);
        }
        $limit = max(1, min(500, (int) $request->query('limit', 100)));

        return response()->json(['data' => $q->orderByDesc($this->dateColumn)->orderByDesc('id')->limit($limit)->get()]);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $model = $this->findOwned($request, $id);
        $this->authorize('view', $model);

        return response()->json(['data' => $model]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules($request));
        $userId = $request->user()->id;

        if (! empty($data['client_id'])) {
            $existing = ($this->modelClass)::query()->where('user_id', $userId)->where('client_id', $data['client_id'])->first();
            if ($existing) {
                return response()->json(['data' => $existing, 'duplicate' => true]);
            }
        }

        $model = new $this->modelClass;
        $model->fill($this->prepare($data, null));
        $model->user_id = $userId;
        $model->save();

        return response()->json(['data' => $model], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $model = $this->findOwned($request, $id);
        $this->authorize('update', $model);
        $data = $request->validate($this->updateRules($request));
        $model->fill($this->prepare($data, $model))->save();

        return response()->json(['data' => $model->refresh()]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $model = $this->findOwned($request, $id);
        $this->authorize('delete', $model);
        $model->delete();

        return response()->json(['deleted' => true]);
    }
}
