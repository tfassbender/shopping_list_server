-- Each user's own order of their spaces (spaces are shared, so the order can't live on the space).
create table user_space_order (
    user_id  varchar(64) not null references users (id) on delete cascade,
    position integer     not null,
    space_id varchar(64) not null,
    primary key (user_id, position)
);
