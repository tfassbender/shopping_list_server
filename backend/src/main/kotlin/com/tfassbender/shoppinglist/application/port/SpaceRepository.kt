package com.tfassbender.shoppinglist.application.port

import com.tfassbender.shoppinglist.domain.space.Space
import com.tfassbender.shoppinglist.domain.space.SpaceId
import com.tfassbender.shoppinglist.domain.user.UserId

interface SpaceRepository {
    fun findById(id: SpaceId): Space?
    fun findByMember(userId: UserId): List<Space>
    fun findByInviteTokenHash(hash: String): Space?
    fun save(space: Space)

    /** Deletes the space with everything in it (lists, layouts, catalog). */
    fun delete(id: SpaceId)
}
