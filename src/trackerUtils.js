/*
 * Copyright (c) 2011 Red Hat, Inc.
 *
 * Gnome Documents is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by the
 * Free Software Foundation; either version 2 of the License, or (at your
 * option) any later version.
 *
 * Gnome Documents is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
 * or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License
 * for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with Gnome Documents; if not, write to the Free Software Foundation,
 * Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
 *
 * Author: Cosimo Cecchi <cosimoc@redhat.com>
 *
 */

const GLib = imports.gi.GLib;

const Global = imports.global;

function setEditedName(newTitle, docId, callback) {
    let sparql = ('INSERT OR REPLACE { <%s> nfo:fileName\"%s\" }'.format(docId, newTitle));

    Global.connectionQueue.update(sparql, null,
        function(object, res) {
            try {
                object.update_finish(res);
            } catch (e) {
                log('Unable to set the new title on ' + docId + ' to : ' + e.toString());
            }

            if (callback)
                callback();
        });

}
