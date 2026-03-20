-- Migration 17: replacement_requests
CREATE TABLE IF NOT EXISTS public.replacement_requests (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_doctor_id   uuid NOT NULL REFERENCES public.doctors(id),
    target_doctor_id      uuid NOT NULL REFERENCES public.doctors(id),
    slot_date             date NOT NULL,
    period                text NOT NULL,
    activity_name         text NOT NULL,
    slot_id               text NOT NULL,
    status                text NOT NULL DEFAULT 'PENDING'
                          CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED')),
    created_at            timestamptz NOT NULL DEFAULT now(),
    resolved_at           timestamptz
);

ALTER TABLE public.replacement_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doctors read their own requests"
    ON public.replacement_requests FOR SELECT
    USING (
        auth.uid() IN (
            SELECT id FROM public.profiles
            WHERE doctor_id::uuid = requester_doctor_id
               OR doctor_id::uuid = target_doctor_id
        )
    );

CREATE POLICY "Authenticated users insert requests"
    ON public.replacement_requests FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users update requests"
    ON public.replacement_requests FOR UPDATE
    USING (auth.uid() IS NOT NULL);
