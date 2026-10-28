package app.expirytracker;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

/**
 * Hands the camera app a file to write the photo into (the same job androidx FileProvider does).
 * Only files named photo-<digits>.jpg in the cache's photos folder are reachable.
 */
public class PhotoProvider extends ContentProvider {
    static final String AUTHORITY = "app.expirytracker.photos";

    static Uri newPhotoUri(Context c) {
        File dir = new File(c.getCacheDir(), "photos");
        File[] old = dir.listFiles();
        if (old != null) {
            for (File f : old) f.delete(); // earlier photos were already copied into the app
        }
        dir.mkdirs();
        return Uri.parse("content://" + AUTHORITY + "/photo-" + System.currentTimeMillis() + ".jpg");
    }

    static File fileFor(Context c, Uri uri) {
        String name = uri == null ? null : uri.getLastPathSegment();
        if (name == null || !name.matches("photo-\\d+\\.jpg")) return null;
        return new File(new File(c.getCacheDir(), "photos"), name);
    }

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File f = fileFor(getContext(), uri);
        if (f == null) throw new FileNotFoundException(String.valueOf(uri));
        return ParcelFileDescriptor.open(f, ParcelFileDescriptor.parseMode(mode));
    }

    @Override
    public String getType(Uri uri) {
        return "image/jpeg";
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        File f = fileFor(getContext(), uri);
        String[] cols = projection != null ? projection : new String[] {OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE};
        MatrixCursor cursor = new MatrixCursor(cols, 1);
        if (f == null) return cursor;
        Object[] row = new Object[cols.length];
        for (int i = 0; i < cols.length; i++) {
            if (OpenableColumns.DISPLAY_NAME.equals(cols[i])) row[i] = f.getName();
            else if (OpenableColumns.SIZE.equals(cols[i])) row[i] = f.length();
        }
        cursor.addRow(row);
        return cursor;
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        return 0;
    }
}
