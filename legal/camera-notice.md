# Camera counting: the sign and the owner's sign-off

> **DRAFT. Not legal advice. Not reviewed by a lawyer. Feature not built.** Lane 10, November 17, 2026. For lanes 11 and 06.

## 1. The sign

Posted at every public entrance, at eye level, readable from 6 feet. English, plus Spanish where the business serves Spanish-speaking customers.

> **Cameras here count people.**
>
> {business} uses cameras and software to count how many people are here and how long the wait is.
>
> - No facial recognition. No one is identified.
> - No video or sound is recorded or kept by the counting system.
> - Only numbers and times are saved.
>
> Questions: {business phone or email}

> **Las cámaras de este lugar cuentan personas.**
>
> {business} usa cámaras y un programa para contar cuántas personas hay y cuánto dura la espera.
>
> - Sin reconocimiento facial. No se identifica a nadie.
> - El sistema de conteo no graba ni guarda video ni sonido.
> - Solo se guardan números y horas.
>
> Preguntas: {business phone or email}

If the business has its own security cameras that do record, the sign must not suggest otherwise. Use "by the counting system" as written and keep the business's own security-camera sign.

## 2. What must be true before the sign goes up

The sign is only honest if the box does what it says. For lane 11 to prove, and for this file to be updated with the proof:

| Claim on the sign | What must be shown |
| --- | --- |
| No one is identified | No face detection, face template, body template or re-identification between frames beyond short-lived tracking needed to count a crossing. No estimate of age, gender or other traits. |
| No video or sound kept | No frame written to disk or sent off the box. Audio input disabled. |
| Only numbers and times | The box sends count, zone or table id, event type and time. This matches the `box_events` table: table id, event, party size, value, time. |

Today the one box on order has its settings stored as "store video: no, faces: no". That is a setting, not proof.

## 3. The owner's sign-off

Recorded in `business_agreements` as kind `camera_signoff`. The go-live gate already requires it in Illinois, Texas and Washington. Proposed: require it in every state.

> **Camera counting at {business}**
>
> I confirm that:
>
> 1. The Pip sign is posted at every public entrance and will stay posted.
> 2. Cameras used for counting point only at public areas: entrances, lines, dining and waiting areas. None covers a restroom, changing room, break room or any place people expect privacy.
> 3. Sound recording is off on every camera the counting box reads.
> 4. My employees have been told in writing that cameras count people in these areas.
> 5. I will not use counts to identify, discipline or track any one person.
> 6. I gave Pip a read-only camera login used for nothing else.
>
> Name · Role · Date

## 4. Open points for the lawyer (memo item 9)

- Whether finding "a person" in a frame is capturing a biometric identifier under the Illinois, Texas or Washington laws [S14]. The Texas Attorney General's stated view is the concern.
- Whether a sign is enough notice in every state, and whether employees need more than item 4.
- Whether short-lived tracking of a person across a counting line changes the answer.
- Whether Pip should refuse camera counting in Illinois until there is a written legal opinion.
