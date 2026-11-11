package com.tfassbender.shoppinglist.application.port

import com.tfassbender.shoppinglist.domain.user.Email
import com.tfassbender.shoppinglist.domain.user.User
import com.tfassbender.shoppinglist.domain.user.UserId

interface UserRepository {
    fun findById(id: UserId): User?
    fun findByEmail(email: Email): User?
    fun findByVerificationTokenHash(hash: String): User?
    fun findByPasswordResetTokenHash(hash: String): User?
    fun findAllByIds(ids: Collection<UserId>): List<User> = ids.mapNotNull { findById(it) }
    fun save(user: User)

    /** Deletes the user including all personal data (favorites, API tokens). */
    fun delete(id: UserId)
}
