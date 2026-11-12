package com.tfassbender.shoppinglist.application.auth

import com.tfassbender.shoppinglist.application.port.TransactionRunner
import com.tfassbender.shoppinglist.domain.user.UserId
import jakarta.enterprise.context.ApplicationScoped
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

/**
 * One in-process lock per user around load-modify-save of the account and its API tokens (the personal
 * counterpart of `SpaceLocks`, without change notifications). Without it, e.g. recording a token's last
 * use from a stale copy could bring back a token that was revoked meanwhile, or undo a password change.
 * Runs in one storage transaction that commits while the lock is held.
 */
@ApplicationScoped
class UserLocks(private val transactions: TransactionRunner) {
    private val locks = ConcurrentHashMap<UserId, ReentrantLock>()

    fun <T> withLock(userId: UserId, action: () -> T): T =
        locks.computeIfAbsent(userId) { ReentrantLock() }.withLock { transactions.inTransaction(action) }
}
