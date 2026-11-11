package com.tfassbender.shoppinglist.adapter.rest

import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/** Live updates over a real HTTP event stream (heartbeat is 1 s in the test profile). */
@QuarkusTest
class EventResourceTest {

    private val streams = mutableListOf<Thread>()

    @AfterEach
    fun stopStreams() = streams.forEach { it.interrupt() }

    /** Opens the event stream of [user] and collects its `data:` lines in the background. */
    private fun openStream(user: TestUser): LinkedBlockingQueue<String> {
        val lines = LinkedBlockingQueue<String>()
        val request = HttpRequest.newBuilder(URI("http://localhost:${RestAssured.port}/api/events"))
            .header("Authorization", "Bearer ${user.token}")
            .header("Accept", "text/event-stream")
            .build()
        val thread = Thread {
            runCatching {
                HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofLines()).body()
                    .filter { it.startsWith("data:") }
                    .forEach { lines.put(it.removePrefix("data:").trim()) }
            }
        }
        thread.isDaemon = true
        thread.start()
        streams += thread
        return lines
    }

    /** Waits for the first line matching [predicate]; null on timeout. */
    private fun LinkedBlockingQueue<String>.awaitLine(seconds: Long, predicate: (String) -> Boolean): String? {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(seconds)
        while (System.nanoTime() < deadline) {
            val line = poll(200, TimeUnit.MILLISECONDS) ?: continue
            if (predicate(line)) return line
        }
        return null
    }

    @Test
    fun `members are notified about changes in their space, others are not`() {
        val owner = TestUsers.register()
        val stranger = TestUsers.register()
        val spaceId: String = owner.request().body(mapOf("name" to "Home")).post("/api/spaces").then().extract().path("id")

        val ownerEvents = openStream(owner)
        val strangerEvents = openStream(stranger)
        // The streams are open once the first heartbeat arrives.
        assertNotNull(ownerEvents.awaitLine(5) { it.contains("PING") })
        assertNotNull(strangerEvents.awaitLine(5) { it.contains("PING") })

        owner.request().body(mapOf("name" to "Groceries")).post("/api/spaces/$spaceId/lists").then().statusCode(201)

        val event = ownerEvents.awaitLine(5) { it.contains("SPACE_CHANGED") }
        assertNotNull(event)
        assertTrue(event.contains(spaceId))
        assertTrue(event.contains("\"seq\""))
        // The stranger keeps getting heartbeats, but never this space's event.
        assertTrue(strangerEvents.awaitLine(3) { it.contains(spaceId) } == null)
    }

    @Test
    fun `the stream requires authentication`() {
        RestAssured.given().get("/api/events").then().statusCode(401)
    }
}
