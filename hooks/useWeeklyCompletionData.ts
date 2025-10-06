import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  format, 
  isToday, 
  isBefore,
  startOfDay,
  endOfDay
} from "date-fns"

export interface WeeklyDayData {
  date: Date
  dayName: string
  dayShort: string
  completedTasks: number
  totalTasks: number
  completedHabits: number
  totalHabits: number
  completedWellness: number
  totalWellness: number
  completionPercentage: number
  isCurrentDay: boolean
  isPastDay: boolean
  isFutureDay: boolean
}

export function useWeeklyCompletionData() {
  const [weekData, setWeekData] = useState<WeeklyDayData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWeeklyData = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        throw new Error('Not authenticated');
      }

      const now = new Date();
      const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday
      const weekEnd = endOfWeek(now, { weekStartsOn: 1 }); // Sunday
      const daysInWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });

      // Fetch all tasks for the current week
      const { data: tasks, error: tasksError } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', user.id)
        .gte('created_at', weekStart.toISOString())
        .lte('created_at', weekEnd.toISOString());

      if (tasksError) throw tasksError;

      // Fetch all habits for the current week
      const { data: habits, error: habitsError } = await supabase
        .from('habits')
        .select('*')
        .eq('user_id', user.id);

      if (habitsError) throw habitsError;

      // Fetch habit completions for the current week
      const { data: habitCompletions, error: habitCompletionsError } = await supabase
        .from('habit_completions')
        .select('*')
        .eq('user_id', user.id)
        .gte('completion_date', format(weekStart, 'yyyy-MM-dd'))
        .lte('completion_date', format(weekEnd, 'yyyy-MM-dd'));

      if (habitCompletionsError) throw habitCompletionsError;

      // Fetch all wellness activities for the current week
      const { data: wellness, error: wellnessError } = await supabase
        .from('wellness_activities')
        .select('*')
        .eq('user_id', user.id);

      if (wellnessError) throw wellnessError;

      // Fetch wellness completions for the current week
      const { data: wellnessCompletions, error: wellnessCompletionsError } = await supabase
        .from('wellness_completions')
        .select('*')
        .eq('user_id', user.id)
        .gte('completion_date', format(weekStart, 'yyyy-MM-dd'))
        .lte('completion_date', format(weekEnd, 'yyyy-MM-dd'));

      if (wellnessCompletionsError) throw wellnessCompletionsError;

      // Process data for each day
      const processedWeekData: WeeklyDayData[] = daysInWeek.map((date) => {
        const dayStart = startOfDay(date);
        const dayEnd = endOfDay(date);
        const isCurrentDay = isToday(date);
        const isPastDay = isBefore(date, startOfDay(now)) && !isCurrentDay;
        const isFutureDay = !isPastDay && !isCurrentDay;
        const dateString = format(date, 'yyyy-MM-dd');

        let completedTasks = 0;
        let totalTasks = 0;
        let completedHabits = 0;
        let totalHabits = 0;
        let completedWellness = 0;
        let totalWellness = 0;

        if (!isFutureDay) {
          // Count tasks for this day
          const dayTasks = tasks?.filter(task => {
            const taskDate = new Date(task.created_at);
            return taskDate >= dayStart && taskDate <= dayEnd;
          }) || [];
          
          totalTasks = dayTasks.length;
          completedTasks = dayTasks.filter(task => task.completed).length;

          // Count habits for this day
          totalHabits = habits?.length || 0;
          completedHabits = habitCompletions?.filter(completion => 
            completion.completion_date === dateString
          ).length || 0;

          // Count wellness activities for this day
          totalWellness = wellness?.length || 0;
          completedWellness = wellnessCompletions?.filter(completion => 
            completion.completion_date === dateString
          ).length || 0;

          // For current day, also check current completion status
          if (isCurrentDay) {
            // Update with real-time completion status
            completedTasks = dayTasks.filter(task => task.completed).length;
            
            // For habits, check if they're marked as completed today
            const todayHabitCompletions = habitCompletions?.filter(completion => 
              completion.completion_date === dateString
            ) || [];
            completedHabits = todayHabitCompletions.length;

            // For wellness, check current completion status
            const todayWellnessCompletions = wellnessCompletions?.filter(completion => 
              completion.completion_date === dateString
            ) || [];
            completedWellness = todayWellnessCompletions.length;
          }
        }

        const totalItems = totalTasks + totalHabits + totalWellness;
        const completedItems = completedTasks + completedHabits + completedWellness;
        const completionPercentage = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

        return {
          date,
          dayName: format(date, 'EEEE'),
          dayShort: format(date, 'EE'),
          completedTasks,
          totalTasks,
          completedHabits,
          totalHabits,
          completedWellness,
          totalWellness,
          completionPercentage,
          isCurrentDay,
          isPastDay,
          isFutureDay
        };
      });

      setWeekData(processedWeekData);
      setError(null);
    } catch (err) {
      console.error('Error fetching weekly completion data:', err);
      const errorMessage = err instanceof Error ? err.message : 
                          typeof err === 'object' && err !== null ? JSON.stringify(err) : 
                          'Failed to fetch weekly data';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  // Set up real-time subscription for current day updates
  useEffect(() => {
    let channels: any[] = [];
    
    const setupRealtimeSubscription = async () => {
      await fetchWeeklyData();
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Subscribe to tasks changes
      const tasksChannel = supabase
        .channel('weekly_tasks_changes')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `user_id=eq.${user.id}`
        }, () => {
          fetchWeeklyData();
        })
        .subscribe();

      // Subscribe to habit completions changes
      const habitCompletionsChannel = supabase
        .channel('weekly_habit_completions_changes')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'habit_completions',
          filter: `user_id=eq.${user.id}`
        }, () => {
          fetchWeeklyData();
        })
        .subscribe();

      // Subscribe to wellness completions changes
      const wellnessCompletionsChannel = supabase
        .channel('weekly_wellness_completions_changes')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'wellness_completions',
          filter: `user_id=eq.${user.id}`
        }, () => {
          fetchWeeklyData();
        })
        .subscribe();

      channels = [tasksChannel, habitCompletionsChannel, wellnessCompletionsChannel];
    };
    
    setupRealtimeSubscription();

    // Set up midnight refresh
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const msUntilMidnight = tomorrow.getTime() - now.getTime();
    
    const midnightTimeout = setTimeout(() => {
      fetchWeeklyData();
      
      // Set up daily refresh at midnight
      const dailyInterval = setInterval(() => {
        fetchWeeklyData();
      }, 24 * 60 * 60 * 1000); // 24 hours
      
      return () => clearInterval(dailyInterval);
    }, msUntilMidnight);

    return () => {
      clearTimeout(midnightTimeout);
      channels.forEach(channel => {
        if (channel) {
          supabase.removeChannel(channel);
        }
      });
    };
  }, [fetchWeeklyData]);

  return {
    weekData,
    loading,
    error,
    refetch: fetchWeeklyData
  };
}
