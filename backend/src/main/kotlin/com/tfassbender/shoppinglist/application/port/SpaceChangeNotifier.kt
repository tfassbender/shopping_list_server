package com.tfassbender.shoppinglist.application.port

import com.tfassbender.shoppinglist.domain.space.SpaceId
import com.tfassbender.shoppinglist.domain.user.UserId

/**
 * Tells interested clients that something in a space changed (live updates). Clients then fetch the
 * changes themselves ("notify, then refetch"), so the notification carries no data.
 */
interface SpaceChangeNotifier {
    /** Notifies the current members of the space. */
    fun spaceChanged(spaceId: SpaceId)

    /**
     * Notifies users who just lost access (space deleted, removed, left). They are no longer members, so
     * [spaceChanged] wouldn't reach them; their clients find out by refetching (→ 404).
     */
    fun accessLost(spaceId: SpaceId, userIds: Collection<UserId>)

    companion object {
        val NONE = object : SpaceChangeNotifier {
            override fun spaceChanged(spaceId: SpaceId) {}
            override fun accessLost(spaceId: SpaceId, userIds: Collection<UserId>) {}
        }
    }
}
