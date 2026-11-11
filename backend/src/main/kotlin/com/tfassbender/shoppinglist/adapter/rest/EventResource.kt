package com.tfassbender.shoppinglist.adapter.rest

import com.tfassbender.shoppinglist.application.port.SequenceCounter
import com.tfassbender.shoppinglist.application.port.SpaceChangeNotifier
import com.tfassbender.shoppinglist.application.port.SpaceRepository
import com.tfassbender.shoppinglist.domain.space.SpaceId
import com.tfassbender.shoppinglist.domain.user.UserId
import io.smallrye.mutiny.Multi
import io.smallrye.mutiny.operators.multi.processors.BroadcastProcessor
import jakarta.annotation.security.RolesAllowed
import jakarta.enterprise.context.ApplicationScoped
import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType
import org.eclipse.microprofile.config.inject.ConfigProperty
import org.eclipse.microprofile.openapi.annotations.Operation
import org.eclipse.microprofile.openapi.annotations.tags.Tag
import org.jboss.resteasy.reactive.RestStreamElementType
import java.time.Duration

/** One live-update notification. `type` PING keeps idle connections open (proxies close silent ones). */
data class SpaceEventDto(val type: String, val spaceId: String? = null, val seq: Long? = null)

/**
 * Broadcasts "space changed" to all open event streams. Each stream filters for the spaces its user is a
 * member of (checked per event, so membership changes take effect at once).
 */
@ApplicationScoped
class SseSpaceChangeNotifier(private val sequence: SequenceCounter) : SpaceChangeNotifier {
    private val processor: BroadcastProcessor<SpaceEventDto> = BroadcastProcessor.create()

    override fun spaceChanged(spaceId: SpaceId) {
        processor.onNext(SpaceEventDto(CHANGED, spaceId.value, sequence.current(spaceId)))
    }

    fun events(): Multi<SpaceEventDto> = processor

    companion object {
        const val CHANGED = "SPACE_CHANGED"
        const val PING = "PING"
    }
}

/**
 * Live updates as server-sent events: `{"type":"SPACE_CHANGED","spaceId":"…","seq":42}` whenever
 * something changed in one of the caller's spaces; the client then pulls the changes.
 * Browsers read it with `fetch` (not `EventSource`), so the usual `Authorization` header works.
 */
@Path("/api/events")
@RolesAllowed(USER_ROLE)
@Tag(name = "Sync")
class EventResource(
    private val notifier: SseSpaceChangeNotifier,
    private val spaces: SpaceRepository,
    private val currentUser: CurrentUser,
    @param:ConfigProperty(name = "shoppinglist.events.heartbeat-seconds", defaultValue = "25")
    private val heartbeatSeconds: Long,
) {

    @GET
    @Produces(MediaType.SERVER_SENT_EVENTS)
    @RestStreamElementType(MediaType.APPLICATION_JSON)
    @Operation(operationId = "streamEvents", summary = "Server-sent events: notifications about changes in the caller's spaces")
    fun events(): Multi<SpaceEventDto> {
        // Resolve the user now: the security context is only available while the request is set up.
        val userId = currentUser.id()
        val changes = notifier.events().filter { event -> isMember(userId, event.spaceId) }
        val pings = Multi.createFrom().ticks().every(Duration.ofSeconds(heartbeatSeconds)).map { SpaceEventDto(SseSpaceChangeNotifier.PING) }
        return Multi.createBy().merging().streams(changes, pings)
    }

    private fun isMember(userId: UserId, spaceId: String?): Boolean =
        spaceId != null && spaces.findById(SpaceId(spaceId))?.isMember(userId) == true
}
