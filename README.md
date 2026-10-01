# Old Vibe

Old Vibe is a [Hack Club](https://hackclub.com) YSWS ("you ship, we ship") for teenagers who
write their own code.

Build something real, track the time in Hackatime, submit it, and we send you Paper. Paper buys
things in the shop: hardware, books, tools. It is free, and it is for people aged 13 to 18.

## The one rule

Use whatever editor you like, AI-enabled ones included. But the code has to be yours.

- No vibe coding, and no agents or chats writing the project for you.
- No accepting AI-generated code, completions included.
- No pasting code you did not write and cannot explain.

We are not trying to catch people out. We would just like Old Vibe to be a place where the hours
people log are hours they actually spent learning. Reviewers are humans, they read your commits
and your README, and they might ask you about a part of the code.

You need at least two tracked hours on a project to submit it.

## How it works

You sign in with Hack Club Auth and connect Hackatime. When a project is ready you pick the
Hackatime projects it covers and submit a repo, a demo people can actually play or download, and
a screenshot. A reviewer looks at the submission, the commit history, the Hackatime activity and
the README, then approves some number of hours. Those hours turn into Paper, a little more if
you have been coding on consecutive days.

The $5 an hour ceiling Hack Club sets for YSWS rewards is built into how we price things: a
Paper costs us about $0.80, and the best streak rate is 6 Paper an hour.

## Running it

You need Node and a Postgres database.

```bash
cd old-vibe
cp .env.example .env
npm install
npm run db:migrate
npm run dev
```

Then open http://localhost:3000. The environment variables are explained in
[old-vibe/README.MD](old-vibe/README.MD). If you do not have Hack Club Auth credentials yet,
`npm run dev:login` makes a test user and gives you a cookie to paste into the browser.

Before opening a pull request, `npm run typecheck` and `npm run lint` should both be clean.

## The team

Maintained by @imu.

## Licence

MIT.
