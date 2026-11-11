package com.tfassbender.shoppinglist.adapter.persistence

import com.tfassbender.shoppinglist.domain.user.ApiToken
import com.tfassbender.shoppinglist.domain.user.ApiTokenId
import com.tfassbender.shoppinglist.domain.user.TokenScope
import com.tfassbender.shoppinglist.domain.user.UserApiTokens
import com.tfassbender.shoppinglist.domain.user.UserId
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Path
import java.time.Instant
import kotlin.io.path.exists
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class FileApiTokenRepositoryTest {

    @TempDir
    lateinit var dataDir: Path

    @Test
    fun `round-trips tokens in the user directory`() {
        val repository = FileApiTokenRepository(JsonFiles(dataDir))
        val user = UserId("u1")
        assertEquals(UserApiTokens(user), repository.find(user))

        val tokens = UserApiTokens(user)
            .add(ApiToken(ApiTokenId("t1"), "Claude", TokenScope.FULL, "hash1", Instant.EPOCH, null))
            .add(ApiToken(ApiTokenId("t2"), "Reader", TokenScope.READ, "hash2", Instant.EPOCH, Instant.EPOCH.plusSeconds(60), Instant.EPOCH))
        repository.save(tokens)

        assertEquals(tokens, repository.find(user))
        assertTrue(dataDir.resolve("users/u1/api-tokens.json").exists())
    }
}
