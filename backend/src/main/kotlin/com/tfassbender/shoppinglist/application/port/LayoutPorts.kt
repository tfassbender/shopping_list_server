package com.tfassbender.shoppinglist.application.port

import com.tfassbender.shoppinglist.domain.list.LayoutId
import com.tfassbender.shoppinglist.domain.list.ShopLayout
import com.tfassbender.shoppinglist.domain.space.SpaceId

interface LayoutRepository {
    fun findById(spaceId: SpaceId, layoutId: LayoutId): ShopLayout?
    fun findBySpace(spaceId: SpaceId): List<ShopLayout>
    fun save(layout: ShopLayout)
    fun delete(spaceId: SpaceId, layoutId: LayoutId)
}
