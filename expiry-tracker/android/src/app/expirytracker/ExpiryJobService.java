package app.expirytracker;

import android.app.job.JobParameters;
import android.app.job.JobService;

/** Background wake-up scheduled by DailyCheck.schedule(); also survives reboots (setPersisted). */
public class ExpiryJobService extends JobService {
    @Override
    public boolean onStartJob(JobParameters params) {
        try {
            DailyCheck.run(this, false, true);
        } catch (RuntimeException ignored) {
            // never crash in the background; the next run tries again
        }
        return false;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }
}
