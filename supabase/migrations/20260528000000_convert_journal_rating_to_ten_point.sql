-- Convert legacy 1-5 whole-star journal ratings to the new internal 1-10 scale.
-- New UI values are stored as half-star steps: 1 = 0.5 stars, 10 = 5 stars.
update journal
set rating = rating * 2
where rating between 1 and 5;
