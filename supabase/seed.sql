-- StorySync MVP seed data: two projects with realistic scenes.
-- Placeholder images are served from the frontend's /public/placeholders.

insert into public.projects (id, name) values
  ('project_deepsea', 'Deep Sea'),
  ('project_blueocean', 'Blue Ocean')
on conflict (id) do nothing;

insert into public.scenes (id, project_id, title, description, position) values
  ('10000000-0000-4000-8000-000000000001', 'project_deepsea', 'Arrival', 'The submersible breaches the dark surface of the ocean for the first time.', 1),
  ('10000000-0000-4000-8000-000000000002', 'project_deepsea', 'Descent', 'Lights cut through the black water as the crew descends toward the abyss.', 2),
  ('10000000-0000-4000-8000-000000000003', 'project_deepsea', 'Discovery', 'A diver discovers an ancient underwater city glowing in the deep.', 3),
  ('10000000-0000-4000-8000-000000000004', 'project_deepsea', 'Ancient City', 'Towering coral-covered ruins stretch beyond the reach of the lights.', 4),
  ('10000000-0000-4000-8000-000000000005', 'project_deepsea', 'Escape', 'The crew races toward the surface as the city begins to collapse.', 5),
  ('10000000-0000-4000-8000-000000000006', 'project_blueocean', 'Opening', 'A fishing boat drifts on a calm, endless blue horizon.', 1),
  ('10000000-0000-4000-8000-000000000007', 'project_blueocean', 'Discovery', 'A whale surfaces beside the boat and leads them toward an unknown shore.', 2),
  ('10000000-0000-4000-8000-000000000008', 'project_blueocean', 'Conflict', 'A storm tears the crew apart from the whale and the shore.', 3),
  ('10000000-0000-4000-8000-000000000009', 'project_blueocean', 'Revelation', 'The storm clears to reveal a hidden island covered in bioluminescent life.', 4),
  ('10000000-0000-4000-8000-00000000000a', 'project_blueocean', 'Finale', 'The crew and the whale share a final moment at sunrise.', 5)
on conflict (id) do nothing;

-- One seed placeholder version per project so the UI is populated immediately.
insert into public.image_versions (id, scene_id, created_by, version_number, image_url, prompt)
select '20000000-0000-4000-8000-000000000001', id, 'storysync', 1, '/placeholders/deepsea.svg',
       'Seed placeholder: the first frame of the deep sea storyboard.'
from public.scenes where project_id = 'project_deepsea' and position = 1;

insert into public.image_versions (id, scene_id, created_by, version_number, image_url, prompt)
select '20000000-0000-4000-8000-000000000002', id, 'storysync', 1, '/placeholders/blueocean.svg',
       'Seed placeholder: the first frame of the blue ocean storyboard.'
from public.scenes where project_id = 'project_blueocean' and position = 1;

update public.scenes
set current_version_id = '20000000-0000-4000-8000-000000000001'
where project_id = 'project_deepsea' and position = 1;

update public.scenes
set current_version_id = '20000000-0000-4000-8000-000000000002'
where project_id = 'project_blueocean' and position = 1;
