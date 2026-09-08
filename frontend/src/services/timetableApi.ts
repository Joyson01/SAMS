import { apiClient } from './api';

export const fetchCurrentTimetableEntry = async (room?: string) => {
    const params = new URLSearchParams();
    if (room) params.append('room', room);
    const response = await apiClient.get(`/classes/timetable/current?${params.toString()}`);
    return response.data;
};
