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

const Lang = imports.lang;
const Signals = imports.signals;

const Gio = imports.gi.Gio;
const _ = imports.gettext.gettext;

const ErrorHandler = new Lang.Class({
    Name: 'ErrorHandler',

    _init: function() {
    },

    addLoadError: function(doc, exception) {
        if (exception.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
            return;

        // Translators: %s is the title of a document
        let message = _("Unable to load \"%s\" for preview").format(doc.name);
        this.emit('load-error', message, exception);
    },

    addQueryError: function(exception) {
        if (exception.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
            return;

        let message = _("Unable to fetch the list of documents");
        this.emit('query-error', message, exception);
    }
});
Signals.addSignalMethods(ErrorHandler.prototype);
