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

## Tech stack: the AWS foundation

L’Ayalga integrates several **AWS cloud services** to create a secure, serverless runtime, persistent household memory and an observability pipeline for its AI agent. The Strands Agents SDK connects these services through typed tools, durable human interruption and resumable sessions.

### **Key AWS components and their value**

#### **1. Amazon Bedrock: model runtime**

- **Components used:** Claude Sonnet 4.6 in production, with Claude Sonnet 4.5 retained as an earlier verified model, accessed through the Amazon Bedrock Converse API.
- **Value added:** Bedrock provides the language intelligence. It helps interpret informal invitations, rescheduling requests and bilingual follow-up, then supplies structured arguments to typed tools. It cannot bypass the deterministic rules for bookings, rooms or household policy.

---

#### **2. Amazon Bedrock AgentCore Runtime**

- **Components used:** The AgentCore direct-code Node.js 22 runtime `layalga_agent-mONXXjFms4`, managed with the AWS CLI `bedrock-agentcore-control` commands.
- **Value added:** AgentCore is the cloud execution environment for the Strands TypeScript agent. It processes queued agent tasks, keeps each claimed invocation open until the run settles and connects to PostgreSQL through the restricted, non-owner `layalga_agent` role. This separates agent execution from the web application’s database authority.

---

#### **3. Amazon Bedrock AgentCore Memory**

- **Components used:** The `LayalgaHouseholdMemory-CBgKZc7mK4` memory resource, with `HouseholdPreferences` and `HouseholdFacts` strategies. Raw events expire after 30 days; extracted long-term records remain until a host erases them.
- **Value added:** Memory can recall useful party preferences across visits, such as ground-floor, room or bed preferences. The system uses this recall to rank room combinations that are already feasible. It excludes family names and raw host-capture conversations, and memory can never change capacity, availability, consent or policy.

---

#### **4. Amazon S3**

- **Components used:** The versioned `layalga-agent-bundles-106403001709` bucket stores packaged AgentCore deployment artifacts.
- **Value added:** Versioned artifacts make each agent release identifiable. AgentCore can update from a specific S3 object version, and operators can restore a previous bundle when a rollback is required.

---

#### **5. AWS Identity and Access Management**

- **Components used:** The `layalga-agentcore-runtime` execution role, repository-managed runtime and memory policies, and the `layalga-web` identity with permission to invoke the specific AgentCore runtime.
- **Value added:** IAM keeps responsibilities separate. The web application can dispatch agent work without managing the runtime, while the agent uses a database role without owner or administrative schema privileges. Memory access is restricted to the project’s single memory resource.

---

#### **6. AWS Distro for OpenTelemetry, CloudWatch and AWS X-Ray**

- **Components used:** AWS Distro for OpenTelemetry automatic instrumentation, AgentCore CloudWatch log groups, CloudWatch Transaction Search and X-Ray tracing.
- **Value added:** The observability pipeline separates model time from tool execution, records token use and helps diagnose failed or slow runs. The documented production trace used 100% sampling and captured one host-invitation run with 10,538 total tokens. That is evidence from one traced operation, not a general token average.

---

#### **7. Amazon Simple Email Service**

- **Components used:** Amazon SES, a web-owned email outbox and restricted delivery policies.
- **Value added:** SES sends host decision and escalation notifications outside the agent’s tool authority. Verified, consenting guest reminders and return links use a separate outbox that the agent cannot read. That guest delivery path is implemented, but its production IAM activation and real-recipient verification remain pending. Provider acceptance is not treated as proof of inbox delivery or a guest reply.

The rest of the application uses Next.js and TypeScript on Vercel. PostgreSQL through Supabase remains the source of truth for rooms, bookings, policy, decisions and workflow state.

The stack is specific to this project. The principle is more general: use the model where language and adaptation help, use deterministic systems where correctness matters, and keep people in control of consequential judgment.

The same pattern can support family travel, appointments, care routines, shared purchases or household maintenance. The agent handles language and follow-through. Reliable software protects facts and permissions. People decide the exceptions.

That is the kind of agent I want in everyday life: one that removes coordination work, respects clear boundaries and follows through.

L’Ayalga is my attempt to make that idea concrete.
