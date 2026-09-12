# The best everyday agents know when not to decide

This weekend, I’m submitting my newest project, L’Ayalga, to the AWS Agents for Humans hackathon in the Everyday Agents category.

L’Ayalga coordinates visits to a shared home. Hosts invite, guests choose suitable rooms, and everyone can track changes, requests and follow-up.

But the bigger idea is not about guest rooms. It is about how agents can become useful in everyday life.

Daily coordination is difficult because information is scattered, plans change and people share responsibility. Some decisions also depend on context that software should not guess. An everyday agent should understand informal requests, check facts, complete routine work and know when to ask a person.

## A simple division of responsibility

The design principle behind L’Ayalga is:

**The agent interprets. Code enforces the rules. People keep the judgment that matters.**

Imagine a message such as: “Could we come next weekend with the children?” The agent can understand the request and prepare the next steps. Software checks dates, rooms, capacity and household rules.

There are three useful outcomes: proceed, decline or ask a person.

Routine work continues. Impossible requests stop. Social exceptions go to a host with a clear explanation.

Human approval is not a magic override. If a room becomes occupied or a rule changes while someone is deciding, the system checks the current situation again. An old “yes” cannot force an action that is no longer valid.

## The agent should finish the job

Everyday work continues after the first action. Plans need confirmation. Unanswered questions need to return to the right person. An agent can carry context across time, resume after a human decision and help the process reach a clear outcome.

## Tech stack

L’Ayalga uses the Strands Agents SDK for the agent loop, typed tools, memory and durable human interruption. Claude Sonnet 4.6 runs through Amazon Bedrock, and the agent runs on AgentCore Runtime. AgentCore Memory supports scoped household preferences, while CloudWatch provides observability.

The application uses Next.js and TypeScript on Vercel. PostgreSQL through Supabase remains the source of truth for bookings, rules and workflow state. Amazon SES supports notifications.

The stack is specific to this project. The principle is more general: use the model where language and adaptation help, use deterministic systems where correctness matters, and keep people in control of consequential judgment.

The same pattern can support family travel, appointments, care routines, shared purchases or household maintenance. The agent handles language and follow-through. Reliable software protects facts and permissions. People decide the exceptions.

That is the kind of agent I want in everyday life: one that removes coordination work, respects clear boundaries and follows through.

L’Ayalga is my attempt to make that idea concrete.
