import { AshPromptsModule } from 'perennial-app';

export const Default = () => (
  <div style={{ maxWidth: 300 }}>
    <AshPromptsModule
      headline="Atelier Foster is overdue with 3 open tasks"
      primaryPrompt={{
        label: "Draft a check-in email",
        message: "Draft a friendly check-in email to Atelier Foster about the overdue deliverables and the 3 open tasks.",
      }}
      prompts={[
        { label: "Summarize where this project stands", message: "Give me a short summary of where the Atelier Foster project stands right now." },
        { label: "Triage the open tasks", message: "Look at the 3 open tasks on this project and tell me which to do first and why." },
        { label: "Turn my notes into next steps", message: "Read my notes on this project and turn them into a clear list of next steps." },
      ]}
      context={{ project: { title: "Atelier Foster — Brand Refresh", status: "overdue" } }}
    />
  </div>
);
