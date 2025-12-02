
import { Doctor } from "../../types";
import { db } from "./index";

export const doctorService = {
    getAllDoctors: async (): Promise<Doctor[]> => {
        return db.doctors.getAll();
    },

    createDoctor: async (doctorData: Partial<Doctor>): Promise<Doctor> => {
        // Generate a UUID-like ID if not present (for Mock compatibility)
        const id = doctorData.id || crypto.randomUUID();
        
        const newDoctor = {
            ...doctorData,
            id,
            role: doctorData.role || 'DOCTOR',
            tempsDeTravail: doctorData.tempsDeTravail || 1.0,
            specialty: doctorData.specialty || [],
            excludedDays: [],
            excludedActivities: [],
            password: doctorData.password
        } as Doctor;
        return db.doctors.create(newDoctor);
    },

    updateDoctor: async (doctor: Doctor): Promise<Doctor> => {
        return db.doctors.update(doctor);
    },

    deleteDoctor: async (id: string): Promise<void> => {
        return db.doctors.delete(id);
    }
};
