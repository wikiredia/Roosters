---
updated: 2026-10-30T09:29:00Z
---

Lesson details: detecting how a source writes its rooms (AP's "NOO.-01.019" and other ways), renaming, merging and
hiding, what the API accepts, saving, schoolmates' layouts, calendar links, friends, export and account deletion.
The cases of `details.apply` are also the ones the app's `lib/details.ts` `detailRows` must give.

## `AP`, `_student`

AP-style locations, and a signed-in student following the school's first class.

## `test_an_ap_room_breaks_into_building_floor_and_room`, `test_other_ways_of_writing_rooms`, `test_several_rooms_and_a_room_that_does_not_fit`, `test_renaming_merging_and_hiding`, `test_layouts_from_the_app_are_checked`, `test_examples_show_the_most`

`details.py` on its own (no database).

## `test_details_suggest_a_layout_from_your_classes`, `test_a_class_not_fetched_yet_learns_from_the_school`, `test_saving_your_layout`, `test_wrong_layouts_and_other_peoples_origins_are_refused`, `test_a_schoolmates_layout_is_offered`, `test_calendar_links_have_their_own_layout_and_it_goes_with_the_link`, `test_friends_see_the_school_origin_but_not_the_link`, `test_layouts_are_exported_and_deleted_with_the_account`

The routes (`r_details.py`) and where layouts go (lessons' `origin`, sources, friends, export, deletion).
