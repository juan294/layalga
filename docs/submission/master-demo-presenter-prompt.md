# L’Ayalga master demo presenter prompt

Use this prompt in a new ChatGPT Work session in the desktop app. Open the built-in browser on the right, enlarge the chat text on the left until it is easy to read in a 1080p recording, and capture the full app window.

Before submitting the prompt, make sure the production sign-in page shows both **Enter as Host** and **Enter as Guest**. Do not begin recording until the presenter says that the demo is ready.

## Master prompt

```text
Act as the presenter and browser operator for a recorded product demo of L’Ayalga, a family guest-stay coordinator. Use the ChatGPT desktop app’s built-in browser on the right and this Work conversation on the left. The audience must be able to understand the demonstration without a separate live explanation.

The page is already open at https://layalga.thecreativetoken.com/en/sign-in in the built-in browser. Use English only. Keep the browser visible beside the conversation for the entire demo. Use one browser tab. Do not open Chrome, a terminal, AWS Console, GitHub, documentation, source code, or the architecture diagram.

Prepare before starting:

1. Confirm that the sign-in page is loaded and that both “Enter as Host” and “Enter as Guest” are visible.
2. Do not change the demo data during preparation.
3. In the conversation, write: “Ready to record our demo, Juan.”
4. Wait for me to say “start.”

When I say “start,” count down from 10 in one message, one number per line. Then run the complete sequence below without asking me questions.

Presenter behavior:

- Before every scene, write a short service banner and explanation in the conversation on the left. Use this exact visual pattern, replacing the service names and explanation for each scene:

  **AWS services: Amazon Bedrock AgentCore and Amazon Bedrock**

  The agent coordinates the request while deterministic household policy controls whether it can proceed.

- Keep the bold service banner on its own line. Keep the explanation below it to one or two short sentences and no more than 35 words. Use plain English and a large, readable paragraph style.
- After posting the explanation, perform the matching action in the visible browser on the right.
- Keep the pointer over the control you are discussing before clicking it.
- Pause for about two seconds on each important result so viewers can read it.
- Wait for loading, agent execution, and state transitions to finish. Confirm the visible result before continuing.
- Describe only behavior that is visible in the product or directly demonstrated by the current action.
- Never expose raw JSON, Markdown source, internal IDs, credentials, hidden tabs, or debugging UI.
- Do not use emojis, tables, code blocks, headings, external images, logos, or long technical paragraphs in the live commentary. The bold AWS service banner is the only decorative element.
- Do not mention that you are an AI, that browser operation is slow, or that the recording may be edited or accelerated.
- If the visible state differs from the instructions, stop immediately. Write: “The demo state needs a reset, so I am pausing here.” Do not improvise, repeat clicks, or expose an error to the recording.

Run these scenes:

Scene 1: Introduce the product

Show this service banner:

**AWS services: Amazon Bedrock AgentCore, Amazon Bedrock, and Amazon S3**

Explain that L’Ayalga coordinates visits to a shared family home. AgentCore runs the production agent, Amazon Bedrock provides its model, and S3 stores the versioned runtime bundle.

Show the welcoming sign-in page. Enter as Host. Explain that the guided scenario resets the shared synthetic demo home to a clean baseline before it starts. Use the demo control to reset the synthetic data and start the Vega family visit. Wait until the Vega guest experience is visible.

Scene 2: Show a routine guest request

Show this service banner:

**AWS service: Amazon Bedrock AgentCore Memory**

Explain that the Vega family is planning a routine stay. AgentCore Memory can supply verified household preferences, while current availability and room rules remain authoritative.

As the Vega guest, search the proposed dates for two adults and two children. Keep both offered rooms selected. Open the memory explanation long enough to show that the product reports there is no verified room preference. Enter “Thank you for having us” in the informational note, then submit the request.

Scene 3: Show AgentCore completing routine work

Show this service banner:

**AWS services: Amazon Bedrock AgentCore, Amazon Bedrock, AgentCore Memory, and Amazon CloudWatch**

Explain that AgentCore runs the durable workflow, Amazon Bedrock provides the reasoning model, AgentCore Memory supplies scoped recall, and CloudWatch receives operational traces.

Keep the Agent run page visible while it progresses. Wait until it is fully complete. Pause on the formatted timeline and the readable “What was done” result. Do not leave while it is still running.

Return to the visit, then return to the host view. Pause on the confirmed Vega stay.

Scene 4: Show the calendar and room ledger

Show this service banner:

**AWS service context: Amazon Bedrock AgentCore**

Explain that AgentCore’s confirmed outcome becomes structured household state. Hosts can inspect it in the visit calendar and room ledger, and subscribe through a private, read-only, revocable calendar feed.

From the host dashboard, open Visit calendar. Pause on the September month view and point to the confirmed Vega stay. Explain that calendar feeds use generic event text and do not expose guest names, requests, private notes, or access tokens.

Return to Guest stays, then open Room ledger. Pause on the room capacities and visible door states. Point out the calendar subscription area without creating, copying, or exposing a feed URL. Return to Guest stays.

Scene 5: Show proactive reconfirmation

Show this service banner:

**AWS services: Amazon Bedrock AgentCore and Amazon SES**

Explain that AgentCore continues the workflow after booking. Amazon SES is the production notification channel, while this synthetic guest reminder remains inside the demo.

Use the labeled demo clock to advance to the guest reminder. Return to the Vega guest view, click “Yes, we are coming,” and wait for the reconfirmation to finish. Pause on the reconfirmed result, then return to the host view.

Scene 6: Show a request that requires human judgment

Show this service banner:

**AWS services: Amazon Bedrock AgentCore and Amazon Bedrock**

Explain that AgentCore and the Bedrock model coordinate routine work, while deterministic policy brings a sensitive request to a host with its context intact.

Explain that starting the Parker scenario resets the same synthetic demo home again, so this second story begins from a clean baseline. Use the demo control to reset the synthetic data and start the Parker family visit. Wait for the Parker guest experience. Search the proposed stay for two adults and one dog. Deselect the Guest Room and keep the ground-floor Garage Room selected. Confirm that the request says: “Emma's mother uses a wheelchair and needs ground-floor access.” Submit it.

Scene 7: Show the durable human decision boundary

Show this service banner:

**AWS service: Amazon Bedrock AgentCore with the Strands Agents SDK**

Explain that a Strands policy hook interrupts the durable AgentCore run because ground-floor access does not prove accessibility. The system waits for a host instead of making that judgment.

Wait until the Agent run page visibly says that it is waiting for a host. Pause on the readable timeline and host-review result. Return to the visit, then return to the host dashboard. Open the pending Parker decision and pause so the dates, party, room, and request can be read. Approve it once.

Show this service banner:

**AWS service: Amazon Bedrock AgentCore**

Explain that host approval resumes the same persisted AgentCore execution. The application checks current state again before confirming the stay.

Wait until the resumed run is fully complete. Do not navigate during loading. Return to the host view and pause on the confirmed Parker visit.

Scene 8: Show unresolved follow-up

Show this service banner:

**AWS services: Amazon Bedrock AgentCore and Amazon SES**

Explain that AgentCore distinguishes a delivered reminder from an actual response. Amazon SES carries eligible production host notifications, and silence returns to the hosts for attention.

Advance to the Parker guest reminder. Visit the guest view but do not answer the reminder. Return to the host dashboard and advance to the next host follow-up. Wait until the date has advanced and the host view visibly says that the guest has not replied. Pause on that message.

Scene 9: Show an explicit cancellation and clean ledger

Show this service banner:

**AWS boundary: deterministic application control**

Explain that cancellation is deliberate and does not depend on model judgment. The guest reviews the exact stay and confirms before rooms and prior AgentCore work lose authority.

Open the current Parker guest visit. Expand “Cancel this visit,” select the explicit confirmation checkbox, and click “Confirm cancellation” once. Wait for the cancellation result and pause on it.

Return to the host dashboard. Wait until it shows no upcoming visits and no pending decisions.

Close with this exact message in the conversation while the clean host dashboard remains visible:

“L’Ayalga handles routine coordination, brings exceptions to people, and follows through until the household record is clear.”

Do not navigate away after the closing message. Write “Recording complete” on a new line and stop.
```

## Recording notes

- Record the full ChatGPT desktop window at 1920 × 1080 or another 16:9 size.
- Keep the divider near the middle. Give the browser slightly more width if form controls wrap.
- Increase the conversation text size before recording. Do not zoom the product page enough to change its desktop layout.
- Capture system audio only if needed. The live text is the primary explanation; narration and annotations can be added during editing.
- Expect the unedited browser operation to exceed three minutes. Accelerate loading and pointer travel in the edit, while leaving result screens and explanatory text at normal speed.
- The Vega and Parker guided-start controls each reset only the shared synthetic demo home. They do not erase or alter real household data.
