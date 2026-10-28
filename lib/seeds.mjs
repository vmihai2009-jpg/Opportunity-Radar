// Hand-researched starting list (checked 28 October 2026). Shown alongside crawled results;
// entries drop off automatically once their deadline has passed.
export const SEEDS = [
  {
    id:'tfl-au4', title:'Architecture + Urbanism Framework 4', group:'Delivery', region:'London', place:'London-wide', buyer:'Transport for London / GLA',
    brief:'New four-year architecture and urbanism framework across nine lots, including commercial / workplace / mixed-use design, public realm and small projects. Up to three lots per supplier.',
    stage:'Open tender', date:'2026-12-08', time:'12:00', published:'2026-10-27', amount:'£45m', valueType:'Total framework ceiling, not a BG fee or guaranteed award', fit:'High',
    rationale:'Strong fit for workplace, commercial refurbishment, public realm and mixed-use work. Potential framework access for multiple public clients.',
    action:'Assess lot 6 (commercial / workplace), the small-projects lot and public-realm lot; check consortium, capacity, insurance and selection criteria.',
    source:'Find a Tender', ref:'101428-2026', url:'https://www.find-tender.service.gov.uk/Notice/101428-2026', tags:['Framework','Workplace','Mixed-use','Public realm'], checked:true
  },
  {
    id:'dover-regeneration', title:'Dover town centre regeneration · lead consultant team', group:'Delivery', region:'South East', place:'Dover, Kent', buyer:'Dover District Council',
    brief:'Multidisciplinary lead consultant appointment to progress key town-centre regeneration projects, supporting design and delivery preparation.',
    stage:'Open tender', date:'2026-11-06', time:'12:00', published:'2026-09-26', amount:'£500k', valueType:'Total estimated consultancy contract, excluding VAT', fit:'Medium',
    rationale:'Place-making and regeneration experience are relevant; confirm whether architectural lead design is central or the appointment is primarily project management.',
    action:'Download ITT via Kent Business Portal; establish architect role within lead team and shortlist delivery partners.',
    source:'Kent Business Portal', ref:'ocds-h6vhtk-077aa1', url:'https://www.kentbusinessportal.org.uk/commonNoticeSearch/viewNotice.html?displayNoticeId=1069564505', tags:['Regeneration','Mixed-use','Consultant team'], checked:true
  },
  {
    id:'crown-estate-consultancy', title:'Crown Estate · multidisciplinary consultancy framework', group:'Delivery', region:'London', place:'Central London + regional portfolio', buyer:'The Crown Estate',
    brief:'Planned multi-lot framework supporting capital projects across London commercial and residential estates, including architectural, engineering and specialist design consultancy.',
    stage:'Pipeline / pre-market', date:'', time:'', published:'2026-09-28', amount:'£70.98m', valueType:'Total anticipated framework ceiling across disciplines, not an architectural fee', fit:'High',
    rationale:'Commercial estate renewal, refurbishment and complex design-team services closely match BG’s typical projects.',
    action:'Check for subsequent live UK4 notice and architecture lots; this record is a planning signal, not an open bid.',
    source:'Find a Tender · pipeline', ref:'091406-2026', url:'https://www.find-tender.service.gov.uk/Notice/091406-2026', tags:['Portfolio','Commercial','Retrofit','Framework'], checked:true
  },
  {
    id:'gstt-refurb', title:'Ward refurbishment programme · professional services', group:'Delivery', region:'London', place:'Central London', buyer:"Guy’s and St Thomas’ NHS Foundation Trust",
    brief:'Preliminary market engagement for multidisciplinary consultants supporting a programme of ward modernisation, ventilation upgrades, building safety and associated works.',
    stage:'Market engagement', date:'2026-11-23', time:'', published:'2026-10-27', amount:'£5m', valueType:'Indicative professional-services programme value across roles', fit:'Conditional',
    rationale:'Large-scale retrofit and technical coordination are relevant, but specialist healthcare experience and procurement route need checking.',
    action:'Respond to market-engagement questionnaire before 23 November and assess healthcare delivery partners.',
    source:'Find a Tender · market engagement', ref:'101425-2026', url:'https://www.find-tender.service.gov.uk/Notice/101425-2026', tags:['Retrofit','Healthcare','Consultancy','Pre-market'], checked:true
  },
  {
    id:'wood-green-mdt', title:'Wood Green Central · multidisciplinary lead consultant', group:'Feasibility', region:'London', place:'Wood Green, Haringey', buyer:'London Borough of Haringey',
    brief:'Lead consultant team to develop a coordinated, commercially credible and deliverable planning proposition for the Wood Green Central / Station Road sites.',
    stage:'Participation deadline', date:'2026-11-20', time:'', published:'2026-10-21', amount:'£1.5m', valueType:'Estimated multidisciplinary consultancy contract', fit:'High',
    rationale:'Architect-led feasibility, placemaking, mixed-use and planning strategy align well. Restricted procedure may limit access.',
    action:'Verify route through the London Construction Programme DPS and expression-of-interest requirements; identify lead and specialist disciplines.',
    source:'Find a Tender', ref:'099724-2026', url:'https://www.find-tender.service.gov.uk/Notice/099724-2026', tags:['Mixed-use','Feasibility','Masterplanning','Planning'], checked:true
  },
  {
    id:'bracknell-extra-care', title:'Extra-care housing · feasibility study', group:'Feasibility', region:'South East', place:'Bracknell, Berkshire', buyer:'Bracknell Forest Borough Council',
    brief:'Commission for a specialist consultancy to undertake feasibility analysis of an extra-care housing proposal.',
    stage:'Open tender', date:'2026-11-20', time:'12:00', published:'2026-10-23', amount:'£40k', valueType:'Estimated total consultancy value, excluding VAT', fit:'Conditional',
    rationale:'Early-stage design services potentially relevant; extra-care housing is less directly aligned to core commercial practice expertise.',
    action:'Examine RFQ to confirm architectural design tasks and required extra-care housing references; bid only if viable.',
    source:'Find a Tender', ref:'100456-2026', url:'https://www.find-tender.service.gov.uk/Notice/100456-2026', tags:['Housing','Study','Small commission'], checked:true
  },
  {
    id:'newforest-green-links', title:'New Forest · green links connectivity study', group:'Feasibility', region:'South East', place:'New Forest, Hampshire', buyer:'New Forest National Park Authority',
    brief:'Four-part feasibility and connectivity study exploring links across the National Park boundary and existing transport barriers, supported by site visits and landscape / route analysis.',
    stage:'Open tender', date:'2026-11-16', time:'12:00', published:'2026-10-22', amount:'£80–100k', valueType:'Indicative total study budget', fit:'Conditional',
    rationale:'Public realm and strategic design relevance, but stronger for a specialist landscape / access-led team.',
    action:'Check methodology, fieldwork requirements and join with a landscape / active-travel consultant if pursuing.',
    source:'Find a Tender', ref:'100093-2026', url:'https://www.find-tender.service.gov.uk/Notice/100093-2026', tags:['Landscape','Access','Strategic feasibility'], checked:true
  },
  {
    id:'norbury-art', title:'Norbury railway bridge · art commission', group:'Competition', region:'London', place:'Croydon, London', buyer:'London Borough of Croydon',
    brief:'Two-stage expression of interest for a creative intervention to Norbury Railway Bridge. Advertised as an artist commission rather than an architectural-services appointment.',
    stage:'Professional creative open call', date:'2026-11-02', time:'17:00', published:'2026-10-14', amount:'£32.5k', valueType:'Total artist commission budget, not architectural fee', fit:'Adjacent',
    rationale:'Relevant only through a public-art or design collaborator. Not a core architecture procurement opportunity.',
    action:'Consider only with an established artist partner; otherwise deprioritise.',
    source:'Find a Tender · art brief', ref:'097168-2026', url:'https://www.find-tender.service.gov.uk/Notice/097168-2026', tags:['Artist-led','Creative commission','Public realm'], checked:true
  },
  {
    id:'marlborough-supergraphics', title:'Marlborough Sports Garden · supergraphics commission', group:'Competition', region:'London', place:'Southwark, London', buyer:'Bankside Open Spaces Trust',
    brief:'Artist / designer open call for site-specific graphics integrated into an accessible sports garden, working alongside the project architect and local community.',
    stage:'Professional creative open call', date:'2026-11-13', time:'', published:'2026-10-26', amount:'£10k', valueType:'Artist fee only; separate fabrication budget', fit:'Adjacent',
    rationale:'Public realm and co-design interest, but the commission is for artwork / graphic design, not architectural services.',
    action:'Share with public-art collaborators; do not treat as a lead architect commission.',
    source:'Bankside Open Spaces Trust', ref:'BOST 2026', url:'https://bost.org.uk/artist-open-call', tags:['Artist-led','Community engagement','Public realm'], checked:true
  },
  {
    id:'newham-maryland', title:'Maryland small sites · design toolkit + community spaces', group:'Public realm', region:'London', place:'Newham, London', buyer:'London Borough of Newham',
    brief:'Design-and-deliver commission for a small-sites design toolkit and two to three community spaces on underused neighbourhood sites. Includes physical works.',
    stage:'Open tender', date:'2026-11-01', time:'23:59', published:'2026-09-25', amount:'£400k', valueType:'Total contract including works, not design fees', fit:'Conditional',
    rationale:'Relevant place-making, consultation and sustainable public-space design; substantial contracting component may require delivery partner.',
    action:'Check construction obligations and quality criteria; pursue only with a credible build / landscape team.',
    source:'Find a Tender', ref:'091197-2026', url:'https://www.find-tender.service.gov.uk/Notice/091197-2026', tags:['Community','Public spaces','Design + build'], checked:true
  },
  {
    id:'southdowns-access', title:'South Downs · rural access infrastructure design framework', group:'Public realm', region:'South East', place:'South Downs, Sussex + Hampshire', buyer:'South Downs National Park Authority',
    brief:'Single-supplier framework for design, engineering and construction support for new access paths and trails, including Centurion Way and Egrets Way.',
    stage:'Participation deadline', date:'2026-11-10', time:'13:00', published:'2026-10-16', amount:'£500k', valueType:'Estimated overall framework ceiling', fit:'Conditional',
    rationale:'Place-making and accessibility overlap, but landscape infrastructure and engineering dominate.',
    action:'Check In-tend participation stage and ask whether an architect / masterplanner can join a team led by an infrastructure consultant.',
    source:'Find a Tender / SDNPA In-tend', ref:'097895-2026', url:'https://www.find-tender.service.gov.uk/Notice/097895-2026', tags:['Access','Trails','Framework','Landscape'], checked:true
  },
  {
    id:'royalparks-conservation', title:'The Royal Parks · conservation architect contract', group:'Heritage', region:'London', place:'Royal Parks, London', buyer:'The Royal Parks',
    brief:'Conservation architect for condition surveys of listed assets, urgent conservation advice, and architectural services across RIBA stages for historic park buildings and structures.',
    stage:'Open tender · confirm date', date:'2026-11-12', time:'', published:'2026-08-14', amount:'£5.25m', valueType:'Total contract estimate across the appointment', fit:'Conditional',
    rationale:'Highly relevant heritage and reuse work, but accredited conservation expertise and tender requirements must be confirmed.',
    action:'Check the buyer portal for live status, actual closing time and conservation accreditation requirements before bid/no-bid.',
    source:'Find a Tender / The Royal Parks', ref:'077600-2026', url:'https://www.find-tender.service.gov.uk/Notice/077600-2026', tags:['Listed buildings','Conservation','RIBA stages'], checked:true,
    warning:'Deadline sourced from tender index; the indexed FTS notice does not expose an unambiguous submission date. Confirm directly with Royal Parks.'
  },
  {
    id:'sandys-row', title:'Sandys Row Synagogue · architect and design team', group:'Heritage', region:'London', place:'Spitalfields, London', buyer:'Foundation for Jewish Heritage / Sandys Row Synagogue',
    brief:'Listed-building condition survey and prioritised restoration strategy with feasibility work for continued worship and cultural / educational reuse.',
    stage:'Open professional brief', date:'2026-11-08', time:'23:59', published:'2026-10-20', amount:'£45k', valueType:'Total design-team fee including surveys, excluding VAT', fit:'Conditional',
    rationale:'Very strong retrofit and listed-building relevance. Mandatory AABC-accredited lead conservation architect; confirm partner availability.',
    action:'Identify AABC-accredited lead. Organiser page says 8 Nov at 23:59, while the brief body cites 9 Nov—seek written confirmation immediately.',
    source:'Heritage Network / Foundation for Jewish Heritage', ref:'SRS 2026', url:'https://www.heritagenetwork.org.uk/opportunities/architect-and-design-team', tags:['Grade II','Feasibility','Conservation'], checked:true,
    warning:'Conflicting dates on organiser page: header says 8 November, body text says 9 November.'
  }
];
