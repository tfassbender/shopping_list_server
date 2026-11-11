package com.tfassbender.shoppinglist.application.port

import com.tfassbender.shoppinglist.domain.space.SpaceId

/**
 * Tells interested clients that something in a space changed (live updates). Clients then fetch the
 * changes themselves ("notify, then refetch"), so the notification carries no data.
 */
fun interface SpaceChangeNotifier {
    fun spaceChanged(spaceId: SpaceId)

    companion object {
        val NONE = SpaceChangeNotifier { }
    }
}
