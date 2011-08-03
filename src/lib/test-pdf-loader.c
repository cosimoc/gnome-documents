#include "gd-pdf-loader.h"

#include <glib.h>
#include <evince-document.h>

static GMainLoop *loop = NULL;

static void
load_ready_cb (GObject *source,
               GAsyncResult *res,
               gpointer _user_data)
{
  EvDocument *document = NULL;
  GError *error = NULL;

  document = gd_pdf_loader_load_uri_finish (GD_PDF_LOADER (source), res, &error);

  if (error != NULL) {
    g_printerr ("Failed loading the PDF document: %s\n", error->message);
    g_error_free (error);
  } else {
    g_print ("Loading OK: %p\n", document);
    g_object_unref (document);
  }

  g_main_loop_quit (loop);
}

int
main (int argc,
      char **argv)
{
  GdPdfLoader *loader;
  GCancellable *cancellable;

  g_type_init ();
  ev_init ();
  loop = g_main_loop_new (NULL, FALSE);

  loader = gd_pdf_loader_new ("goa:documents:account_1311218785");
  cancellable = g_cancellable_new ();
  gd_pdf_loader_load_uri_async (loader, "https://docs.google.com/feeds/documents/private/full/document%3A1AwLAOHbqJdSMaj-LChH77t9liQwzHDBaPdfiY5zzFuk",
                                cancellable, load_ready_cb, NULL);
  g_object_unref (cancellable);
  g_main_loop_run (loop);

  g_object_unref (loader);

  return 0;
}
