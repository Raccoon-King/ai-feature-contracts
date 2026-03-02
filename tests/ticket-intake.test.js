const intake = require('../lib/ticket-intake.cjs');

describe('ticket intake', () => {
  it('detects when no structured ticket is provided', () => {
    const parsed = intake.parseTicketInput('create feature X');

    expect(parsed.kind).toBe('unstructured');
    expect(parsed.ticket.what).toBe('create feature X');
    expect(parsed.missingFields).toEqual(['who', 'why', 'dod']);
  });

  it('asks only the missing essential wizard questions', () => {
    const questions = intake.getWizardQuestions({
      who: 'Developers using Grabby',
      what: 'Generate a ticket draft',
      why: '',
      dod: [],
    });

    expect(questions.map((question) => question.field)).toEqual(['why', 'dod']);
    expect(questions.length).toBeLessThanOrEqual(5);
  });

  it('parses the new Who/What/Why/DoD shape', () => {
    const parsed = intake.parseTicketInput(`Who: Developers using Grabby
What: Add a ticket wizard
Why: Developers start with an idea, not a full ticket

Definition of Done
- Required fields are present
- DoD is a bullet list
`);

    expect(parsed.kind).toBe('structured');
    expect(parsed.ticket.who).toBe('Developers using Grabby');
    expect(parsed.ticket.what).toBe('Add a ticket wizard');
    expect(parsed.ticket.why).toBe('Developers start with an idea, not a full ticket');
    expect(parsed.ticket.dod).toEqual([
      'Required fields are present',
      'DoD is a bullet list',
    ]);
  });

  it('maps the legacy ticket shape into the new shape', () => {
    const parsed = intake.parseTicketInput(`Ticket ID: TT-123
Who: Platform engineering
What: Update the intake parser
What System: contracts/ and docs/

DoD:
- Parser accepts the old shape
`);

    expect(parsed.kind).toBe('legacy');
    expect(parsed.ticket.ticketId).toBe('TT-123');
    expect(parsed.ticket.who).toBe('Platform engineering');
    expect(parsed.ticket.what).toBe('Update the intake parser');
    expect(parsed.ticket.why).toBe('Requested for contracts/ and docs/.');
    expect(parsed.ticket.dod).toEqual(['Parser accepts the old shape']);
  });

  it('renders a deterministic markdown ticket draft', () => {
    const markdown = intake.buildTicketMarkdown({
      ticketId: 'GRAB-INTAKE-002',
      who: 'Developers using Grabby intake',
      what: 'Add a Ticket Generator wizard',
      why: 'Developers often start with an idea',
      dod: ['Required fields are present', 'DoD is a bullet list'],
    });

    expect(markdown).toBe(`Ticket ID: GRAB-INTAKE-002
Who: Developers using Grabby intake
What: Add a Ticket Generator wizard
Why: Developers often start with an idea

Definition of Done
- Required fields are present
- DoD is a bullet list
`);
  });
});
