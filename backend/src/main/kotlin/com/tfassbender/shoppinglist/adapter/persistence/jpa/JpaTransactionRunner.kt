package com.tfassbender.shoppinglist.adapter.persistence.jpa

import com.tfassbender.shoppinglist.application.port.TransactionRunner
import io.quarkus.narayana.jta.QuarkusTransaction

/**
 * JTA transaction around an operation. Joins a running transaction, so the repositories (which wrap every
 * method in [inTransaction] too) take part in the one opened by `SpaceLocks`. An exception rolls it back.
 */
class JpaTransactionRunner : TransactionRunner {
    override fun <T> inTransaction(action: () -> T): T = QuarkusTransaction.joiningExisting().call(action)
}
