package com.tfassbender.shoppinglist.application

import com.tfassbender.shoppinglist.application.port.EmailSender
import com.tfassbender.shoppinglist.application.port.SequenceCounter
import com.tfassbender.shoppinglist.application.port.ShoppingListRepository
import com.tfassbender.shoppinglist.application.port.SpaceRepository
import com.tfassbender.shoppinglist.application.port.SessionToken
import com.tfassbender.shoppinglist.application.port.TokenIssuer
import com.tfassbender.shoppinglist.application.port.UserRepository
import com.tfassbender.shoppinglist.domain.list.ListId
import com.tfassbender.shoppinglist.domain.list.ShoppingList
import com.tfassbender.shoppinglist.domain.space.Space
import com.tfassbender.shoppinglist.domain.space.SpaceId
import com.tfassbender.shoppinglist.domain.user.Email
import com.tfassbender.shoppinglist.domain.user.Language
import com.tfassbender.shoppinglist.domain.user.User
import com.tfassbender.shoppinglist.domain.user.UserId
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset

/** In-memory fakes of the driven ports for container-free application tests. */
class InMemoryUserRepository : UserRepository {
    val users = linkedMapOf<UserId, User>()

    override fun findById(id: UserId) = users[id]
    override fun findByEmail(email: Email) = users.values.firstOrNull { it.email == email }
    override fun findByVerificationTokenHash(hash: String) = users.values.firstOrNull { it.emailVerification?.hash == hash }
    override fun findByPasswordResetTokenHash(hash: String) = users.values.firstOrNull { it.passwordReset?.hash == hash }
    override fun save(user: User) {
        users[user.id] = user
    }

    override fun delete(id: UserId) {
        users.remove(id)
    }
}

class RecordingEmailSender : EmailSender {
    data class SentMail(val kind: String, val to: Email, val language: Language, val rawToken: String)

    val sent = mutableListOf<SentMail>()

    override fun sendVerification(to: Email, displayName: String, language: Language, rawToken: String) {
        sent += SentMail("verification", to, language, rawToken)
    }

    override fun sendPasswordReset(to: Email, displayName: String, language: Language, rawToken: String) {
        sent += SentMail("reset", to, language, rawToken)
    }

    fun lastToken(kind: String): String = sent.last { it.kind == kind }.rawToken
}

/** Encodes user id and session version so tests can check what was issued. */
class FakeTokenIssuer(private val clock: Clock) : TokenIssuer {
    override fun issue(user: User) = SessionToken("token-${user.id.value}-${user.sessionVersion}", clock.instant().plusSeconds(3600))
}

/** A clock tests can move forward. */
class MutableClock(var now: Instant = Instant.parse("2026-01-01T10:00:00Z")) : Clock() {
    override fun getZone(): ZoneId = ZoneOffset.UTC
    override fun withZone(zone: ZoneId?): Clock = this
    override fun instant(): Instant = now
    fun advance(duration: Duration) {
        now = now.plus(duration)
    }
}

class InMemorySpaceRepository : SpaceRepository {
    val spaces = linkedMapOf<SpaceId, Space>()

    override fun findById(id: SpaceId) = spaces[id]
    override fun findByMember(userId: UserId) = spaces.values.filter { it.isMember(userId) }
    override fun findByInviteTokenHash(hash: String) = spaces.values.firstOrNull { s -> s.invites.any { it.tokenHash == hash } }
    override fun save(space: Space) {
        spaces[space.id] = space
    }

    override fun delete(id: SpaceId) {
        spaces.remove(id)
    }
}

/** Thread-safe, so concurrency tests can use it. */
class InMemoryListRepository : ShoppingListRepository {
    private val lists = java.util.concurrent.ConcurrentHashMap<Pair<SpaceId, ListId>, ShoppingList>()

    override fun findById(spaceId: SpaceId, listId: ListId) = lists[spaceId to listId]
    override fun findBySpace(spaceId: SpaceId) = lists.values.filter { it.spaceId == spaceId }
    override fun save(list: ShoppingList) {
        lists[list.spaceId to list.id] = list
    }
}

class InMemorySequenceCounter : SequenceCounter {
    private val values = java.util.concurrent.ConcurrentHashMap<SpaceId, Long>()

    override fun next(spaceId: SpaceId): Long = values.merge(spaceId, 1L, Long::plus)!!
    override fun current(spaceId: SpaceId): Long = values[spaceId] ?: 0
}
