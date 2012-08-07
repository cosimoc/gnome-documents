/*
 * Copyright (c) 2011, 2012 Red Hat, Inc.
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by 
 * the Free Software Foundation; either version 2 of the License, or (at your
 * option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
 * or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU Lesser General Public 
 * License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License 
 * along with this program; if not, write to the Free Software Foundation,
 * Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
 *
 * Author: Cosimo Cecchi <cosimoc@redhat.com>
 *
 */

#ifndef __GD_PDF_LOADER_H__
#define __GD_PDF_LOADER_H__

#include <glib-object.h>
#include <gio/gio.h>
#include <evince-view.h>

#define GOA_API_IS_SUBJECT_TO_CHANGE
#include <gdata/gdata.h>
#include <zpj/zpj.h>

G_BEGIN_DECLS

void gd_pdf_loader_load_uri_async (const gchar *uri,
                                   GCancellable *cancellable,
                                   GAsyncReadyCallback callback,
                                   gpointer user_data);
EvDocumentModel *gd_pdf_loader_load_uri_finish (GAsyncResult *res,
                                                GError **error);

void gd_pdf_loader_load_gdata_entry_async (GDataEntry *entry,
                                           GDataDocumentsService *service,
                                           GCancellable *cancellable,
                                           GAsyncReadyCallback callback,
                                           gpointer user_data);
EvDocumentModel *gd_pdf_loader_load_gdata_entry_finish (GAsyncResult *res,
                                                        GError **error);

void gd_pdf_loader_load_zpj_entry_async (ZpjSkydriveEntry *entry,
                                         ZpjSkydrive *service,
                                         GCancellable *cancellable,
                                         GAsyncReadyCallback callback,
                                         gpointer user_data);
EvDocumentModel *gd_pdf_loader_load_zpj_entry_finish (GAsyncResult *res,
                                                      GError **error);

G_END_DECLS

#endif /* __GD_PDF_LOADER_H__ */
