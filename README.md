# Daymark

Daymark is a calendar-first personal planner for college work, DSA, projects, and skills. Select a date to see its agenda, then add, edit, move, complete, or delete a task. Use **All tasks** to search across dates and filter by status. The category filters apply to both views.

Daymark includes removable sample tasks on first use. Your tasks stay in the current browser and are scoped to the site address. They do not sync between devices or move automatically from a local preview to the deployed site.

## Run locally

From the project folder, run:

```sh
python -m http.server 4173 --bind 127.0.0.1 --directory public
```

Open [localhost:4173](http://localhost:4173). No dependency installation is required.

## Deploy to Vercel

Push this folder to a Git repository and import the repository into Vercel. Use the folder containing `vercel.json` as the project root. The configuration serves `public/` directly and requires no build command or environment variables.
