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

const _ = imports.gettext.gettext;

function ErrorHandler() {
    this._init();
}

ErrorHandler.prototype = {
    _init: function() {
    },

    addLoadError: function(doc, exception) {
        // Translators: %s is the title of a document
        let message = _("Unable to load \"%s\" for preview").format(doc.name);

        // FIXME: we need support for error codes in GJS
        if (exception.toString().indexOf('Operation was cancelled') != -1)
            return;

        log('Error caught: ' + message + ' - ' + exception.message);

        this.emit('load-error', message, exception);
    },

    addQueryError: function(exception) {
        let message = _("Unable to fetch the list of documents");

        // FIXME: we need support for error codes in GJS
        if (exception.toString().indexOf('Operation was cancelled') != -1)
            return;

        this.emit('query-error', message, exception);
    }
};
Signals.addSignalMethods(ErrorHandler.prototype);
