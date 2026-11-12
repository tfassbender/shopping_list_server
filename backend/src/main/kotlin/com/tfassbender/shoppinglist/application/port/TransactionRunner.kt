package com.tfassbender.shoppinglist.application.port

/**
 * Runs an operation in one storage transaction, so a use case that saves several aggregates (e.g. a list,
 * the sequence counter and the sync state) commits all of them or none. Joins a transaction that is
 * already running. Kept as a port so the application layer stays free of `@Transactional`.
 */
interface TransactionRunner {
    fun <T> inTransaction(action: () -> T): T

    companion object {
        /** For storages without transactions (JSON files) and for plain unit tests. */
        val NONE = object : TransactionRunner {
            override fun <T> inTransaction(action: () -> T): T = action()
        }
    }
}
