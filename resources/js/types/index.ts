export type Source = 'manual' | 'watch' | 'imported' | 'gps';

export interface Profile {
    birth_date: string | null;
    sex: string | null;
    height_cm: number | null;
    evaluated_by_professional: boolean | null;
    last_evaluation_date: string | null;
    sleep_goal_hours: number | null;
    steps_goal: number | null;
    activity_level: string | null;
    timezone: string;
}

export interface Me {
    id: number;
    name: string;
    email: string;
    profile: Profile;
}

export interface SleepRecord {
    id: number;
    night_date: string;
    bedtime: string;
    sleep_onset_at: string | null;
    wake_time: string;
    night_awakenings: number | null;
    awake_minutes: number | null;
    time_in_bed_minutes: number;
    sleep_minutes: number;
    quality: number | null;
    morning_energy: number | null;
    notes: string | null;
    source_type: Source;
}

export interface FoodEntry {
    id: number;
    name: string;
    meal_type: string;
    eaten_at: string;
    quantity: number | null;
    unit: string | null;
    feeling_after: string | null;
    kcal: number | null;
    nutrition_status: 'verified' | 'estimated' | 'unknown';
    notes: string | null;
    catalog_id: number | null;
}

export interface FoodCatalogItem {
    id: number;
    slug: string;
    name: string;
    category: string;
    image: string | null;
    nutrition_status: string;
    portion_kcal: { small: number; medium: number; large: number } | null;
    portion_kcal_source: string | null;
}

export interface SymptomEntry {
    id: number;
    symptom_type: string;
    custom_label: string | null;
    occurred_at: string;
    intensity: number;
    duration_minutes: number | null;
    at_rest: boolean | null;
    context: string | null;
    activity: string | null;
    trend: string | null;
    notes: string | null;
}

export interface BodyMeasurement {
    id: number;
    kind: string;
    value: number;
    unit: string;
    measured_at: string;
    notes: string | null;
}

export interface ActivityEntry {
    id: number;
    activity_type: string;
    started_at: string;
    steps: number | null;
    duration_minutes: number | null;
    distance_km: number | null;
    perceived_effort: number | null;
    notes: string | null;
    source_type: Source;
}

export interface Device {
    id: number;
    name: string;
    model: string | null;
    connection_status: string;
    integration_status: string;
    last_sync_at: string | null;
}

export interface SafetyStatus {
    level: 'none' | 'caution' | 'prompt_evaluation' | 'emergency';
    messages: { code: string; text: string }[];
    activity_progression_allowed: boolean;
    evaluated_by_professional: boolean | null;
    rules_version: string;
    disclaimer: string;
}

export interface Dashboard {
    safety: SafetyStatus;
    sleep: SleepRecord | null;
    activity_today: { entries: number; steps: number | null; duration_minutes: number | null; sources: Source[] };
    recent_meals: FoodEntry[];
    weight: { value: number; unit: string; measured_at: string; source_type: Source } | null;
    waist: { value: number; unit: string; measured_at: string; source_type: Source } | null;
    recent_symptoms: SymptomEntry[];
    habits_today: { id: number; habit: string; done: boolean; custom_label: string | null }[];
    goals: { sleep_goal_hours: number | null; steps_goal: number | null };
    device: { id: number; name: string; connection_status: string; integration_status: string; last_sync_at: string | null } | null;
    last_measurement: { type: string; value: number | null; unit: string; source_type: Source; measured_at: string; quality_status: string } | null;
}

export interface Trends {
    period: { from: string; to: string };
    sleep: { night: string; sleep_minutes: number; time_in_bed_minutes: number; bed_minute_of_day: number; quality: number | null }[];
    sleep_regularity: { bedtime_sd_minutes: number; nights: number } | null;
    weight: { at: string; value: number; unit: string }[];
    waist: { at: string; value: number; unit: string }[];
    activity: { day: string; steps: number | null; duration_minutes: number | null }[];
    symptoms: { at: string; type: string; intensity: number }[];
    meals: { day: string; count: number }[];
    comparison: { sleep_avg_minutes: { current: number | null; previous: number | null }; previous_period: { from: string; to: string } };
}

export interface ActivityCatalogItem {
    id: number;
    slug: string;
    name: string;
    category: string;
    met: number | null;
    is_custom: boolean;
    icon: string | null;
}

export interface ActivityEstimate {
    gross_kcal: number | null;
    net_kcal: number | null;
    met: number | null;
    quality: 'good' | 'low' | 'unavailable';
    assumptions: string[];
    missing: string[];
    weight_kg: number | null;
    weight_source: 'entry' | 'measurement' | null;
}

export interface ActivityEntryFull extends ActivityEntry {
    catalog_id: number | null;
    custom_label: string | null;
    weight_kg: number | null;
    distance_source: 'manual' | 'gps' | 'watch' | null;
    track_id: number | null;
    estimate: ActivityEstimate | null;
}

export interface EnergyDay {
    date: string;
    timezone: string;
    consumed: {
        total_kcal: number | null;
        verified_kcal: number | null;
        estimated_kcal: number | null;
        entries: number;
        entries_with_kcal: number;
        missing: { id: number; name: string; meal_type: string }[];
        by_meal: { meal_type: string; kcal: number | null; entries: number; missing: number }[];
    };
    expenditure: {
        resting: { kcal: number | null; method: string; missing: string[] };
        activities: {
            net_kcal: number | null;
            gross_kcal_info_only: number | null;
            items: (ActivityEstimate & { id: number; name: string; minutes: number | null; source: string })[];
        };
        total_kcal: number | null;
        formula: string;
    };
    balance: { kcal: number | null; status: 'surplus' | 'deficit' | 'close' | null; complete: boolean; reasons: string[]; caveats: string[] };
    watch_energy: { used: boolean; reason: string };
    reliability?: { level: string; notes: string[] };
}

export interface EnergyHistory {
    period: { from: string; to: string };
    days: { date: string; consumed_kcal: number | null; expenditure_kcal: number | null; balance_kcal: number | null; status: string | null; complete: boolean }[];
    summary: { days_with_balance: number; avg_balance_kcal: number | null; note: string };
}

export interface Track {
    id: number;
    status: 'recording' | 'paused' | 'finished' | 'interrupted';
    label: string | null;
    started_at: string;
    ended_at: string | null;
    duration_seconds: number;
    distance_m: number;
    points_count: number;
    rejected_points: number;
    gap_count: number;
    avg_accuracy_m: number | null;
    current_segment: number;
    end_reason: string | null;
}

export interface TrackPoint {
    lat: number;
    lng: number;
    accuracy_m: number | null;
    captured_at: string;
    segment: number;
}

export interface TimelineItem {
    type: 'wake' | 'sleep' | 'meal' | 'activity' | 'track' | 'measurement' | 'symptom' | 'reminder';
    at: string;
    title: string;
    detail: Record<string, unknown> | null;
    source: string;
    detected: boolean;
    id: number;
    link: string | null;
}

export interface DayData {
    date: string;
    timezone: string;
    timeline: TimelineItem[];
    recap: {
        foods: { name: string; meal_type: string }[];
        activities: number;
        activity_minutes: number | null;
        distance_declared_km: number | null;
        distance_gps_unassigned_km: number | null;
        consumed_kcal: number | null;
        expenditure_kcal: number | null;
        balance_kcal: number | null;
        balance_status: string | null;
        balance_caveats: string[];
        missing: string[];
    };
}

export interface AppNotification {
    id: number;
    kind: string;
    title: string;
    body: string | null;
    link: string | null;
    read_at: string | null;
    push_status: string;
    created_at: string;
}

export interface NotifPref {
    kind: string;
    label: string;
    description: string;
    timed: boolean;
    enabled: boolean;
    time_of_day: string;
    frequency: 'daily' | 'weekdays' | 'weekly';
    weekday: number | null;
}

export interface NotifPrefsPayload {
    enabled: boolean;
    timezone: string;
    preferences: NotifPref[];
    push: { server_configured: boolean; public_key: string | null; subscriptions: number };
}
