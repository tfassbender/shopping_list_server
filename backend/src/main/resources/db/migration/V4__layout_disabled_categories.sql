-- Categories a shop doesn't have (issue #7): their items are sorted to the end of the list.
create table layout_disabled_categories (
    layout_pk   bigint      not null references shop_layouts (pk) on delete cascade,
    category_id varchar(64) not null,
    primary key (layout_pk, category_id)
);
