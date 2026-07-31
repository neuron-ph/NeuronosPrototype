-- Migration 263: seed the remaining four scorecards (Brokerage, Forwarding,
-- Trucking, Business Development). Pricing was seeded in 254.
--
-- Config data, not schema. Idempotent, so it is safe to re-run and carries the
-- definitions to prod. Text is VERBATIM from the Falcons PDFs.
--
-- Weights: Brokerage 9 KPIs, Forwarding 8, Trucking 11, BDD 8. Each sums to 100.
-- The Trucking PDF numbers its rows 1, 3-12 with no #2; that numbering artifact
-- is preserved in sort_order so the printed sheet and the screen agree.
--
-- Several metric_keys have no resolver yet. That is deliberate and safe:
-- get_kpi_scorecard checks pg_proc before dispatching and renders a missing
-- resolver as "Not yet measurable", which EXCLUDES the KPI and renormalises
-- rather than scoring it zero. Definitions can therefore lead implementation,
-- and each KPI lights up by itself the day its resolver lands.
--
-- Resolvers still missing at the time of writing: lodgment_tat, fan_tat,
-- manifest_on_time, ontime_delivery, charge_demurrage, charge_detention,
-- charge_storage, incident_penalty, incident_damage, vehicle_pms,
-- trip_doc_accuracy, crm_calls, crm_emails, meetings_held, new_customers,
-- attendance_punctuality.

INSERT INTO kpi_definitions (
  id, scorecard_key, sort_order, name, definition_text, target_text, measurement_text,
  weight_pct, source, metric_key, target_value, target_unit, direction, rating_thresholds,
  effective_from
)
SELECT * FROM (VALUES

-- ─── Business Development (8) ────────────────────────────────────────────────
('kpi-bdd-calls','bdd',1,'Calls','Prospecting / follow-up calls to clients and leads. Target of 40 calls per week.','Target 40 calls per week','(Actual calls logged per week / 40) x 100%, averaged over the period',12,'logged','crm_calls',100,'pct','higher_better','{"kind": "pct_of_target"}'::jsonb,DATE '2026-01-01'),
('kpi-bdd-emails','bdd',2,'Emails','Business-development emails to clients and leads. Target of 40 emails per week.','40 emails per week','(Actual emails sent per week / 40) x 100%, averaged over the period',12,'logged','crm_emails',100,'pct','higher_better','{"kind": "pct_of_target"}'::jsonb,DATE '2026-01-01'),
('kpi-bdd-meetings','bdd',3,'Meetings','Client / prospect meetings (in-person or virtual). Target of three (3) meetings per week.','Target 3 meetings per week','(Actual meetings held per week / 3) x 100%, averaged over the period',13,'auto','meetings_held',100,'pct','higher_better','{"kind": "pct_of_target"}'::jsonb,DATE '2026-01-01'),
('kpi-bdd-newcustomer','bdd',4,'New Customer','New accounts onboarded / first booking secured. Target of at least one (1) new customer per month.','At least 1 new customer per month','Count of new customers onboarded per month vs. target of 1',20,'auto','new_customers',1,'count','higher_better','{"kind": "pct_of_target"}'::jsonb,DATE '2026-01-01'),
('kpi-bdd-quota','bdd',5,'Set Targeted Quota','Achievement of the individually assigned sales / revenue quota for the period.','100% or more of quota achieved','(Actual sales / revenue achieved / Assigned quota) x 100%',20,'auto','sales_quota',100,'pct','higher_better','{"kind": "pct_of_target"}'::jsonb,DATE '2026-01-01'),
('kpi-bdd-punctuality','bdd',6,'Punctuality','Attendance and on-time reporting for work, meetings and assigned tasks.','100% - no tardiness / no absence without leave','Count of tardiness / undertime / unauthorized absences per month',8,'logged','attendance_punctuality',0,'incidents','zero_target','{"kind": "zero_incidents"}'::jsonb,DATE '2026-01-01'),
('kpi-bdd-behavior','bdd',7,'Behavior','Conduct, professionalism, teamwork, and compliance with the Company Code of Conduct.','Full compliance - no disciplinary record','Supervisor evaluation and count of documented incidents',7,'judgment',NULL,0,'incidents','zero_target','{"kind": "zero_incidents"}'::jsonb,DATE '2026-01-01'),
('kpi-bdd-penalties','bdd',8,'Penalties / Lapses','Missed commitments, reporting lapses, or violations of company policy / client agreements.','Zero penalties / lapses','Count of penalties or documented lapses per month',8,'logged','incident_penalty',0,'incidents','zero_target','{"kind": "zero_incidents"}'::jsonb,DATE '2026-01-01'),

-- ─── Brokerage (9) ───────────────────────────────────────────────────────────
('kpi-brok-lodgment','brokerage',1,'Lodgment','Entry lodged within 24 hours from the date of completion of final import documents OR the Manifest date, whichever comes later.','100% lodged within 24 hrs','(No. of entries lodged within 24 hrs / Total entries) x 100%',15,'auto','lodgment_tat',100,'pct','higher_better','{"kind": "pct_of_target"}'::jsonb,DATE '2026-01-01'),
('kpi-brok-fan','brokerage',2,'Final Assessment Notice','Final Assessment Notice secured within 48 hours from the date of lodgment.','100% within 48 hrs','(No. of FANs within 48 hrs / Total entries) x 100%',15,'auto','fan_tat',100,'pct','higher_better','{"kind": "pct_of_target"}'::jsonb,DATE '2026-01-01'),
('kpi-brok-demurrage','brokerage',3,'Demurrage Charges','Demurrage incurred due to Declarant delay or negligence (late lodgment, assessment, or release).','Zero (0) demurrage due to internal fault','Total demurrage charges on shipments handled by the employee, due to own delay (per month)',10,'proposed','charge_demurrage',0,'php','zero_target','{"kind": "zero_incidents"}'::jsonb,DATE '2026-01-01'),
('kpi-brok-detention','brokerage',4,'Detention Charges','Detention incurred due to Declarant delay or negligence in processing/release of shipment.','Zero (0) detention due to internal fault','Total detention charges on shipments handled by the employee, due to own delay (per month)',10,'proposed','charge_detention',0,'php','zero_target','{"kind": "zero_incidents"}'::jsonb,DATE '2026-01-01'),
('kpi-brok-storage','brokerage',5,'Storage Charges','Storage/warehousing fees incurred due to Declarant delay or negligence.','Zero (0) storage due to internal fault','Total storage charges on shipments handled by the employee, due to own delay (per month)',10,'proposed','charge_storage',0,'php','zero_target','{"kind": "zero_incidents"}'::jsonb,DATE '2026-01-01'),
('kpi-brok-penalties','brokerage',6,'Penalties / Lapses','Fines, surcharges, or lapses from BOC or other regulatory bodies due to error, misdeclaration, or non-compliance.','Zero penalties / lapses','Count of penalties or documented lapses per month',10,'logged','incident_penalty',0,'incidents','zero_target','{"kind": "zero_incidents"}'::jsonb,DATE '2026-01-01'),
('kpi-brok-punctuality','brokerage',7,'Punctuality','Attendance and on-time reporting for work and assigned processing tasks.','100% - no tardiness / no absence without leave','Count of tardiness / undertime / unauthorized absences per month',10,'logged','attendance_punctuality',0,'incidents','zero_target','{"kind": "zero_incidents"}'::jsonb,DATE '2026-01-01'),
('kpi-brok-behavior','brokerage',8,'Behavior','Conduct, professionalism, teamwork, and compliance with the Company Code of Conduct.','Full compliance - no disciplinary record','Supervisor evaluation and count of documented incidents',10,'judgment',NULL,0,'incidents','zero_target','{"kind": "zero_incidents"}'::jsonb,DATE '2026-01-01'),
('kpi-brok-billing','brokerage',9,'Billing','Billing statement issued within 24 hours after completion of delivery.','100% billed within 24 hrs','(No. of billings issued within 24 hrs / Total completed deliveries) x 100%',10,'auto','billing_tat_24h',100,'pct','higher_better','{"kind": "pct_of_target"}'::jsonb,DATE '2026-01-01'),

-- ─── Forwarding (8) ──────────────────────────────────────────────────────────
('kpi-fwd-manifest','forwarding',1,'Late Manifest','Timely and accurate submission of the manifest to avoid late-manifest penalties and shipment delays.','Zero late manifests','Count of late / erroneous manifest submissions per month',20,'auto','manifest_on_time',100,'pct','higher_better','{"kind": "pct_of_target"}'::jsonb,DATE '2026-01-01'),
('kpi-fwd-penalties','forwarding',2,'Penalties / Lapses','Fines, surcharges, or lapses from carriers, ports, or regulatory bodies due to error or non-compliance.','Zero penalties / lapses','Count of penalties or documented lapses per month',15,'logged','incident_penalty',0,'incidents','zero_target','{"kind": "zero_incidents"}'::jsonb,DATE '2026-01-01'),
('kpi-fwd-demurrage','forwarding',3,'Demurrage Charges','Demurrage incurred due to forwarding delay or negligence.','Zero (0) demurrage due to internal fault','Total demurrage charges on shipments handled by the employee, due to own delay (per month)',10,'proposed','charge_demurrage',0,'php','zero_target','{"kind": "zero_incidents"}'::jsonb,DATE '2026-01-01'),
('kpi-fwd-detention','forwarding',4,'Detention Charges','Detention incurred due to forwarding delay or negligence.','Zero (0) detention due to internal fault','Total detention charges on shipments handled by the employee, due to own delay (per month)',10,'proposed','charge_detention',0,'php','zero_target','{"kind": "zero_incidents"}'::jsonb,DATE '2026-01-01'),
('kpi-fwd-storage','forwarding',5,'Storage Charges','Storage/warehousing fees incurred due to forwarding delay or negligence.','Zero (0) storage due to internal fault','Total storage charges on shipments handled by the employee, due to own delay (per month)',10,'proposed','charge_storage',0,'php','zero_target','{"kind": "zero_incidents"}'::jsonb,DATE '2026-01-01'),
('kpi-fwd-punctuality','forwarding',6,'Punctuality','Attendance and on-time reporting for work and assigned tasks.','100% - no tardiness / no absence without leave','Count of tardiness / undertime / unauthorized absences per month',10,'logged','attendance_punctuality',0,'incidents','zero_target','{"kind": "zero_incidents"}'::jsonb,DATE '2026-01-01'),
('kpi-fwd-behavior','forwarding',7,'Behavior','Conduct, professionalism, teamwork, and compliance with the Company Code of Conduct.','Full compliance - no disciplinary record','Supervisor evaluation and count of documented incidents',10,'judgment',NULL,0,'incidents','zero_target','{"kind": "zero_incidents"}'::jsonb,DATE '2026-01-01'),
('kpi-fwd-billing','forwarding',8,'Billing','Billing statement issued within 24 hours after completion of delivery.','100% billed within 24 hrs','(No. of billings issued within 24 hrs / Total completed deliveries) x 100%',15,'auto','billing_tat_24h',100,'pct','higher_better','{"kind": "pct_of_target"}'::jsonb,DATE '2026-01-01'),

-- ─── Trucking (11) ───────────────────────────────────────────────────────────
('kpi-trk-ontime','trucking',1,'On-Time Delivery / On-Time Container Pull-Out','Cargo delivered to consignee within the agreed / scheduled delivery window. Container pulled out from port / depot within the agreed schedule to avoid delays and extra charges.','100% on-time delivery','(No. of on-time deliveries / Total deliveries) x 100%',25,'auto','ontime_delivery',100,'pct','higher_better','{"kind": "pct_of_target"}'::jsonb,DATE '2026-01-01'),
('kpi-trk-demurrage','trucking',3,'Demurrage Charges','Demurrage incurred due to trucking delay or negligence (late pull-out / return).','Zero (0) demurrage due to internal fault','Total demurrage charges on trips handled by the employee, due to own delay (per month)',8,'proposed','charge_demurrage',0,'php','zero_target','{"kind": "zero_incidents"}'::jsonb,DATE '2026-01-01'),
('kpi-trk-detention','trucking',4,'Detention Charges','Detention/per-diem incurred due to late return of equipment or trucking delay.','Zero (0) detention due to internal fault','Total detention charges on trips handled by the employee, due to own delay (per month)',8,'proposed','charge_detention',0,'php','zero_target','{"kind": "zero_incidents"}'::jsonb,DATE '2026-01-01'),
('kpi-trk-storage','trucking',5,'Storage Charges','Storage fees incurred due to trucking delay or negligence in pull-out / delivery.','Zero (0) storage due to internal fault','Total storage charges on trips handled by the employee, due to own delay (per month)',8,'proposed','charge_storage',0,'php','zero_target','{"kind": "zero_incidents"}'::jsonb,DATE '2026-01-01'),
('kpi-trk-penalties','trucking',6,'Penalties / Lapses','Traffic, LTO / LTFRB, or company violations; documented operational lapses.','Zero penalties / lapses','Count of violations or documented lapses per month',10,'logged','incident_penalty',0,'incidents','zero_target','{"kind": "zero_incidents"}'::jsonb,DATE '2026-01-01'),
('kpi-trk-damage','trucking',7,'Damage-Free Delivery / Cargo Safety','Cargo delivered intact, without loss, shortage, or damage while in transit.','Zero cargo damage / loss','Count of damage / loss / shortage incidents per month',10,'logged','incident_damage',0,'incidents','zero_target','{"kind": "zero_incidents"}'::jsonb,DATE '2026-01-01'),
('kpi-trk-pms','trucking',8,'Vehicle Maintenance & Roadworthiness','Compliance with the preventive-maintenance schedule and roadworthiness of assigned unit.','100% PMS compliance - no avoidable breakdown','PMS compliance rate; count of avoidable breakdowns per month',8,'logged','vehicle_pms',100,'pct','higher_better','{"kind": "pct_of_target"}'::jsonb,DATE '2026-01-01'),
('kpi-trk-tripdocs','trucking',9,'Trip Documentation Accuracy','Accurate and complete trip tickets, POD, and supporting documents submitted on time.','100% accurate & complete','(No. of accurate/complete trip documents / Total trips) x 100%',5,'logged','trip_doc_accuracy',100,'pct','higher_better','{"kind": "pct_of_target"}'::jsonb,DATE '2026-01-01'),
('kpi-trk-punctuality','trucking',10,'Punctuality','Attendance and on-time reporting for duty and dispatch.','100% - no tardiness / no absence without leave','Count of tardiness / undertime / unauthorized absences per month',8,'logged','attendance_punctuality',0,'incidents','zero_target','{"kind": "zero_incidents"}'::jsonb,DATE '2026-01-01'),
('kpi-trk-behavior','trucking',11,'Behavior','Conduct, professionalism, teamwork, and compliance with the Company Code of Conduct.','Full compliance - no disciplinary record','Supervisor evaluation and count of documented incidents',5,'judgment',NULL,0,'incidents','zero_target','{"kind": "zero_incidents"}'::jsonb,DATE '2026-01-01'),
('kpi-trk-billing','trucking',12,'Billing','Billing statement / delivery documents processed within 24 hours after completion of delivery.','100% within 24 hrs','(No. processed within 24 hrs / Total completed deliveries) x 100%',5,'auto','billing_tat_24h',100,'pct','higher_better','{"kind": "pct_of_target"}'::jsonb,DATE '2026-01-01')

) AS v(id, scorecard_key, sort_order, name, definition_text, target_text, measurement_text,
       weight_pct, source, metric_key, target_value, target_unit, direction, rating_thresholds,
       effective_from)
WHERE NOT EXISTS (SELECT 1 FROM kpi_definitions d WHERE d.id = v.id);
