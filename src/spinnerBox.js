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

const Gtk = imports.gi.Gtk;
const GtkClutter = imports.gi.GtkClutter;
const _ = imports.gettext.gettext;

const Tweener = imports.util.tweener;

const Lang = imports.lang;
const Mainloop = imports.mainloop;

const _SPINNER_SIZE = 128;

function SpinnerBox() {
    this._init();
}

SpinnerBox.prototype = {
    _init: function() {
        this._delayedMoveId = 0;

        this.widget = new Gtk.Grid({ orientation: Gtk.Orientation.VERTICAL,
                                     row_spacing: 24,
                                     hexpand: true,
                                     vexpand: true,
                                     halign: Gtk.Align.CENTER,
                                     valign: Gtk.Align.CENTER });

        this.actor = new GtkClutter.Actor({ contents: this.widget,
                                            opacity: 255 });

        this._spinner = new Gtk.Spinner({ width_request: _SPINNER_SIZE,
                                          height_request: _SPINNER_SIZE,
                                          halign: Gtk.Align.CENTER,
                                          valign: Gtk.Align.CENTER });
        this._spinner.start();
        this.widget.add(this._spinner);

        this._label = new Gtk.Label({ label: '<big><b>' + _("Loading...") + '</b></big>',
                                      use_markup: true,
                                      halign: Gtk.Align.CENTER,
                                      valign: Gtk.Align.CENTER });
        this.widget.add(this._label);

        this.widget.connect('destroy', Lang.bind(this, this._clearDelayId));
        this.widget.show_all();
    },

    _clearDelayId: function() {
        if (this._delayedMoveId != 0) {
            Mainloop.source_remove(this._delayedMoveId);
            this._delayedMoveId = 0;
        }
    },

    moveIn: function() {
        this._clearDelayId();
        this.actor.opacity = 255;
        this.actor.raise_top();
    },

    moveOut: function() {
        this._clearDelayId();

        Tweener.addTween(this.actor, { opacity: 0,
                                       time: 0.30,
                                       transition: 'easeOutQuad',
                                       onComplete: function () {
                                           this.actor.lower_bottom();
                                       },
                                       onCompleteScope: this });
    },

    moveInDelayed: function(delay) {
        this._clearDelayId();

        this._delayedMoveId = Mainloop.timeout_add(delay, Lang.bind(this,
            function() {
                this._delayedMoveId = 0;

                this.moveIn();
                return false;
            }));
    }
};
