<?php

namespace App\Policies;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/** One policy for every record that carries a user_id: only the owner may touch it. */
class OwnedPolicy
{
    public function view(User $user, Model $model): bool
    {
        return $model->user_id === $user->id;
    }

    public function update(User $user, Model $model): bool
    {
        return $model->user_id === $user->id;
    }

    public function delete(User $user, Model $model): bool
    {
        return $model->user_id === $user->id;
    }
}
