package com.tfassbender.shoppinglist.adapter.rest

import com.tfassbender.shoppinglist.application.space.CreatedInvite
import com.tfassbender.shoppinglist.application.space.MemberView
import com.tfassbender.shoppinglist.application.space.SpaceService
import com.tfassbender.shoppinglist.domain.space.Invite
import com.tfassbender.shoppinglist.domain.space.InviteId
import com.tfassbender.shoppinglist.domain.space.Role
import com.tfassbender.shoppinglist.domain.space.Space
import com.tfassbender.shoppinglist.domain.space.SpaceId
import com.tfassbender.shoppinglist.domain.user.UserId
import jakarta.annotation.security.RolesAllowed
import jakarta.ws.rs.Consumes
import jakarta.ws.rs.DELETE
import jakarta.ws.rs.GET
import jakarta.ws.rs.POST
import jakarta.ws.rs.PUT
import jakarta.ws.rs.Path
import jakarta.ws.rs.PathParam
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType
import org.eclipse.microprofile.config.inject.ConfigProperty
import org.eclipse.microprofile.openapi.annotations.Operation
import org.eclipse.microprofile.openapi.annotations.media.Content
import org.eclipse.microprofile.openapi.annotations.media.Schema
import org.eclipse.microprofile.openapi.annotations.responses.APIResponse
import org.eclipse.microprofile.openapi.annotations.tags.Tag
import org.jboss.resteasy.reactive.ResponseStatus
import java.time.Duration
import java.time.Instant

data class NameRequest(val name: String = "")
data class CreateInviteRequest(val expiresInHours: Long? = null)
data class TransferOwnershipRequest(val userId: String = "")

data class SpaceDto(val id: String, val name: String, val myRole: Role, val memberCount: Int, val createdAt: Instant) {
    companion object {
        fun from(space: Space, me: UserId) =
            SpaceDto(space.id.value, space.name, space.memberOrNull(me)?.role ?: Role.MEMBER, space.members.size, space.createdAt)
    }
}

data class MemberDto(val userId: String, val displayName: String, val role: Role, val joinedAt: Instant) {
    companion object {
        fun from(view: MemberView) = MemberDto(view.member.userId.value, view.displayName, view.member.role, view.member.joinedAt)
    }
}

data class InviteDto(val id: String, val createdAt: Instant, val expiresAt: Instant) {
    companion object {
        fun from(invite: Invite) = InviteDto(invite.id.value, invite.createdAt, invite.expiresAt)
    }
}

/** Space ids in the wanted order; unknown ids are ignored, missing spaces come after the listed ones. */
data class SpaceOrderRequest(val spaceIds: List<String>)

/** The raw token and the full link are only returned here, once. */
data class CreatedInviteDto(val invite: InviteDto, val token: String, val url: String)

@Path("/api/spaces")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@RolesAllowed(USER_ROLE)
@Tag(name = "Spaces", description = "Spaces are the unit of sharing: lists, layouts and categories belong to a space")
class SpaceResource(
    private val spaceService: SpaceService,
    private val currentUser: CurrentUser,
    @param:ConfigProperty(name = "shoppinglist.public-base-url")
    private val publicBaseUrl: String,
) {

    @GET
    @Operation(operationId = "listSpaces", summary = "All spaces the current user is a member of")
    fun list(): List<SpaceDto> {
        val me = currentUser.id()
        return spaceService.listMine(me).map { SpaceDto.from(it, me) }
    }

    @PUT
    @Path("/order")
    @Operation(
        operationId = "reorderSpaces",
        summary = "Set the current user's own order of their spaces (used by the space list); returns the spaces in the new order",
    )
    fun reorder(request: SpaceOrderRequest): List<SpaceDto> {
        val me = currentUser.id()
        return spaceService.reorder(me, request.spaceIds.map(::SpaceId)).map { SpaceDto.from(it, me) }
    }

    @POST
    @Operation(operationId = "createSpace", summary = "Create a space; the creator becomes its owner")
    @ResponseStatus(201)
    @APIResponse(responseCode = "201", description = "Created", content = [Content(schema = Schema(implementation = SpaceDto::class))])
    fun create(request: NameRequest): SpaceDto {
        val me = currentUser.id()
        val space = spaceService.create(me, request.name)
        return SpaceDto.from(space, me)
    }

    @GET
    @Path("/{spaceId}")
    @Operation(operationId = "getSpace", summary = "A space of the current user")
    fun get(@PathParam("spaceId") spaceId: String): SpaceDto {
        val me = currentUser.id()
        return SpaceDto.from(spaceService.get(me, SpaceId(spaceId)), me)
    }

    @PUT
    @Path("/{spaceId}/name")
    @Operation(operationId = "renameSpace", summary = "Rename a space (owner only)")
    fun rename(@PathParam("spaceId") spaceId: String, request: NameRequest): SpaceDto {
        val me = currentUser.id()
        return SpaceDto.from(spaceService.rename(me, SpaceId(spaceId), request.name), me)
    }

    @DELETE
    @Path("/{spaceId}")
    @Operation(operationId = "deleteSpace", summary = "Delete a space with all its lists (owner only)")
    fun delete(@PathParam("spaceId") spaceId: String) {
        spaceService.delete(currentUser.id(), SpaceId(spaceId))
    }

    @GET
    @Path("/{spaceId}/members")
    @Operation(operationId = "listMembers", summary = "Members of a space with display names")
    fun members(@PathParam("spaceId") spaceId: String): List<MemberDto> =
        spaceService.members(currentUser.id(), SpaceId(spaceId)).map(MemberDto::from)

    @DELETE
    @Path("/{spaceId}/members/{userId}")
    @Operation(operationId = "removeMember", summary = "Remove a member (owner only)")
    fun removeMember(@PathParam("spaceId") spaceId: String, @PathParam("userId") userId: String) {
        spaceService.removeMember(currentUser.id(), SpaceId(spaceId), UserId(userId))
    }

    @POST
    @Path("/{spaceId}/leave")
    @Operation(operationId = "leaveSpace", summary = "Leave a space (the owner must hand over ownership first)")
    // Without this, the spec would claim 201 for a POST without return value; the server sends 204.
    @APIResponse(responseCode = "204", description = "No Content")
    fun leave(@PathParam("spaceId") spaceId: String) {
        spaceService.leave(currentUser.id(), SpaceId(spaceId))
    }

    @POST
    @Path("/{spaceId}/transfer-ownership")
    @Operation(operationId = "transferOwnership", summary = "Hand over ownership to another member (owner only)")
    fun transferOwnership(@PathParam("spaceId") spaceId: String, request: TransferOwnershipRequest): SpaceDto {
        val me = currentUser.id()
        return SpaceDto.from(spaceService.transferOwnership(me, SpaceId(spaceId), UserId(request.userId)), me)
    }

    @GET
    @Path("/{spaceId}/invites")
    @Operation(operationId = "listInvites", summary = "Open (unused, unexpired) invites (owner only)")
    fun invites(@PathParam("spaceId") spaceId: String): List<InviteDto> =
        spaceService.listInvites(currentUser.id(), SpaceId(spaceId)).map(InviteDto::from)

    @POST
    @Path("/{spaceId}/invites")
    @Operation(
        operationId = "createInvite",
        summary = "Create a single-use invite link (owner only). Default validity 24 h, allowed 1 h to 30 days",
    )
    @ResponseStatus(201)
    @APIResponse(responseCode = "201", description = "Created", content = [Content(schema = Schema(implementation = CreatedInviteDto::class))])
    fun createInvite(@PathParam("spaceId") spaceId: String, request: CreateInviteRequest?): CreatedInviteDto {
        // Capped before converting: a huge number would overflow (500) instead of failing validation (400).
        val validFor = Duration.ofHours((request?.expiresInHours ?: 24).coerceIn(-1L, 1_000_000L))
        val created = spaceService.createInvite(currentUser.id(), SpaceId(spaceId), validFor)
        return toDto(created)
    }

    @DELETE
    @Path("/{spaceId}/invites/{inviteId}")
    @Operation(operationId = "revokeInvite", summary = "Revoke an unused invite (owner only)")
    fun revokeInvite(@PathParam("spaceId") spaceId: String, @PathParam("inviteId") inviteId: String) {
        spaceService.revokeInvite(currentUser.id(), SpaceId(spaceId), InviteId(inviteId))
    }

    private fun toDto(created: CreatedInvite) =
        CreatedInviteDto(InviteDto.from(created.invite), created.rawToken, "$publicBaseUrl/invite/${created.rawToken}")
}
