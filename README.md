# Daymark

Daymark is a calendar-first personal planner for college work, DSA, projects, and skills. Select a date to see its agenda, then add, edit, move, complete, or delete a task. Use **All tasks** to search across dates and filter by status. The category filters apply to both views.

Give any task an optional label and choose a color from the swatches in the editor. Tasks without a custom color use their category color. Labels appear in the agenda and task list, and you can search for them in **All tasks**.

Switch between **Month** and **Week** to see the same schedule at different scales. The weekly progress strip lets you jump to a day and see how many of its tasks are done.

Set a task to repeat daily, on weekdays, or weekly on its start day. The optional end date is inclusive. Each occurrence has its own completion state. Editing the schedule updates the whole series, and **Skip this date** removes only the open occurrence. You can undo a skip or deletion from the confirmation message.

Daymark includes removable sample tasks on first use. Your tasks stay in the current browser and are scoped to the site address. They do not sync between devices or move automatically from a local preview to the deployed site.

## Run locally

From the project folder, run:

```sh
python -m http.server 4173 --bind 127.0.0.1 --directory public
```

Open [localhost:4173](http://localhost:4173). No dependency installation is required.

## Deploy to Vercel

Push this folder to a Git repository and import the repository into Vercel. Use the folder containing `vercel.json` as the project root. The configuration serves `public/` directly and requires no build command or environment variables.
