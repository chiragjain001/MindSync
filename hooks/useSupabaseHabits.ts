import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Habit } from '@/store/use-mindmate-store';
import { useRouter } from 'next/navigation';

interface SupabaseHabit {
  id: string;
  user_id: string;
  title: string;
  note?: string;
  time?: string;
  timezone: string;
  current_streak: number;
  longest_streak: number;
  last_completion?: string;
  created_at: string;
  updated_at: string;
}

export function useSupabaseHabits() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Check if habit is completed today
  const checkCompletedToday = useCallback(async (habitId: string, timezone: string) => {
    try {
      const { data, error } = await supabase
        .rpc('rpc_is_habit_completed_today', { habit_uuid: habitId });

      if (error) {
        console.error('Error checking habit completion:', error);
        return false;
      }

      return !!data;
    } catch (err) {
      console.error('Error in checkCompletedToday:', err);
      return false;
    }
  }, []);

  // Fetch habits from Supabase
  const fetchHabits = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        console.error('Auth error:', authError);
        router.push('/auth');
        return;
      }

      const { data, error } = await supabase
        .from('habits')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      // Check completion status for each habit
      const habitsWithStatus = await Promise.all((data || []).map(async (habit: SupabaseHabit) => {
        const completedToday = await checkCompletedToday(habit.id, habit.timezone);
        
        return {
          id: habit.id,
          title: habit.title,
          note: habit.note,
          time: habit.time,
          streak: habit.current_streak,
          completedToday
        } as Habit;
      }));

      setHabits(habitsWithStatus);
      setError(null);
    } catch (err) {
      console.error('Error fetching habits:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch habits');
    } finally {
      setLoading(false);
    }
  }, [router, checkCompletedToday]);

  // Add a new habit
  const addHabit = useCallback(async (habit: Pick<Habit, 'title' | 'note' | 'time'>) => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        throw new Error('Not authenticated');
      }

      // Get user's timezone
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      const { data, error } = await supabase
        .from('habits')
        .insert([{
          user_id: user.id,
          title: habit.title,
          note: habit.note || '',
          time: habit.time || '',
          timezone: userTimezone,
          current_streak: 0,
          longest_streak: 0
        }])
        .select()
        .single();

      if (error) {
        throw error;
      }

      const newHabit: Habit = {
        id: data.id,
        title: data.title,
        note: data.note,
        time: data.time,
        streak: data.current_streak,
        completedToday: false
      };

      setHabits(prev => [newHabit, ...prev]);
      return newHabit;
    } catch (err) {
      console.error('Error adding habit:', err);
      setError(err instanceof Error ? err.message : 'Failed to add habit');
      throw err;
    }
  }, []);

  // Toggle habit completion using RPC functions with optimistic updates
  const toggleHabit = useCallback(async (id: string) => {
    const habit = habits.find(h => h.id === id);
    if (!habit) return;

    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        throw new Error('Not authenticated');
      }

      // Optimistic update for immediate feedback
      const optimisticUpdate = {
        ...habit,
        completedToday: !habit.completedToday,
        streak: !habit.completedToday ? habit.streak + 1 : Math.max(0, habit.streak - 1)
      };
      
      setHabits(prev => prev.map(h => h.id === id ? optimisticUpdate : h));

      if (habit.completedToday) {
        // Unmark completion using RPC
        const { data, error } = await supabase
          .rpc('rpc_unmark_habit_completion', { habit_uuid: id });

        if (error) {
          console.error('RPC unmark error:', error);
          throw error;
        }

        // Update local state with response from RPC
        setHabits(prev => prev.map(h => {
          if (h.id === id) {
            return {
              ...h,
              completedToday: false,
              streak: data?.current_streak || 0
            };
          }
          return h;
        }));
      } else {
        // Mark completion using RPC
        const { data, error } = await supabase
          .rpc('rpc_mark_habit_completion', { habit_uuid: id });

        if (error) {
          console.error('RPC mark error:', error);
          throw error;
        }

        // Update local state with response from RPC
        setHabits(prev => prev.map(h => {
          if (h.id === id) {
            return {
              ...h,
              completedToday: true,
              streak: data?.current_streak || h.streak + 1
            };
          }
          return h;
        }));
      }
    } catch (err) {
      console.error('Error toggling habit:', err);
      
      // Revert optimistic update on error
      setHabits(prev => prev.map(h => h.id === id ? habit : h));
      
      // Set user-friendly error message
      const errorMessage = err instanceof Error ? err.message : 'Failed to toggle habit';
      setError(errorMessage);
      
      // Check if it's a missing RPC function error
      if (errorMessage.includes('function') && errorMessage.includes('does not exist')) {
        setError('Database functions not found. Please run the migration script first.');
      }
      
      throw err;
    }
  }, [habits]);

  // Delete a habit (CASCADE will handle habit_completions)
  const deleteHabit = useCallback(async (id: string) => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        throw new Error('Not authenticated');
      }

      // Delete the habit (CASCADE will delete completions automatically)
      const { error } = await supabase
        .from('habits')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) {
        throw error;
      }

      setHabits(prev => prev.filter(habit => habit.id !== id));
    } catch (err) {
      console.error('Error deleting habit:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete habit');
      throw err;
    }
  }, []);

  // Set up real-time subscription and initial fetch
  useEffect(() => {
    let habitsChannel: any;
    let completionsChannel: any;

    const setupRealtimeSubscriptions = async () => {
      await fetchHabits();
      // Get current user for filtering
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Subscribe to real-time changes for habits with user filtering
      habitsChannel = supabase
        .channel('habits_changes')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'habits',
          filter: `user_id=eq.${user.id}`
        }, () => {
          fetchHabits();
        })
        .subscribe();

      // Subscribe to real-time changes for completions with user filtering
      completionsChannel = supabase
        .channel('completions_changes')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'habit_completions',
          filter: `user_id=eq.${user.id}`
        }, () => {
          fetchHabits();
        })
        .subscribe();
    };

    setupRealtimeSubscriptions();

    return () => {
      if (habitsChannel) {
        supabase.removeChannel(habitsChannel);
      }
      if (completionsChannel) {
        supabase.removeChannel(completionsChannel);
      }
    };
  }, [fetchHabits]);

  return {
    habits,
    loading,
    error,
    addHabit,
    toggleHabit,
    deleteHabit,
    refetch: fetchHabits
  };
}
