/*
 * Copyright (c) 2012 Red Hat, Inc.
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

const Gd = imports.gi.Gd;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const GtkClutter = imports.gi.GtkClutter;
const _ = imports.gettext.gettext;

const Global = imports.global;

const Lang = imports.lang;
const Signals = imports.signals;

function PrintNotification(printOp, doc) {
    this._init(printOp, doc);
}

PrintNotification.prototype = {
    _init: function(printOp, doc) {
        this.widget = null;
        this._printOp = printOp;
        this._doc = doc;

        this._printOp.connect('begin-print',
                              Lang.bind(this, this._onPrintBegin));
        this._printOp.connect('status-changed',
                              Lang.bind(this, this._onPrintStatus));
    },

    _onPrintBegin: function() {
        this.widget = new Gtk.Grid({ orientation: Gtk.Orientation.VERTICAL,
                                     row_spacing: 6,
                                     margin_left: 12,
                                     margin_right: 12});

        this._statusLabel = new Gtk.Label();
        this.widget.add(this._statusLabel);
        this._progressBar = new Gtk.ProgressBar();
        this.widget.add(this._progressBar);

        this._stopButton = new Gtk.Button({ child: new Gtk.Image({ icon_name: 'process-stop-symbolic',
                                                                   pixel_size: 16,
                                                                   margin_top: 2,
                                                                   margin_bottom: 2 }),
                                            margin_left: 12,
                                            valign: Gtk.Align.CENTER
                                            });
        this.widget.attach_next_to(this._stopButton, this._statusLabel,
                                   Gtk.PositionType.RIGHT, 1, 2);
        this._stopButton.connect('clicked', Lang.bind(this,
            function() {
                this._printOp.cancel();
                this.widget.destroy();
            }));

        Global.notificationManager.addNotification(this);
    },

    _onPrintStatus: function() {
        if (!this.widget)
            return;

        let status = this._printOp.get_status();
        let fraction = this._printOp.get_progress();
	let name = this._printOp.get_job_name();
	status = _("Printing \"%s\": %s").format(this._doc.name, status);

        this._statusLabel.set_text(status);
        this._progressBar.fraction = fraction;

        if (fraction == 1)
            this.widget.destroy();
    }
};

function NotificationManager() {
    this._init();
}

NotificationManager.prototype = {
    _init: function() {
        this.widget = new Gd.Notification({ timeout: -1,
                                            show_close_button: false });
        this._grid = new Gtk.Grid({ orientation: Gtk.Orientation.VERTICAL,
                                    row_spacing: 6 });

        this.actor = new GtkClutter.Actor({ contents: this.widget,
                                            opacity: 0 });
        this.actor.get_widget().get_style_context().add_class('documents-osd');
        this.actor.get_widget().reset_style();

        this.widget.add(this._grid);
        this._grid.show();
    },

    addNotification: function(notification) {
        this._activeNotification = notification;
        this._grid.add(notification.widget);

        notification.widget.show_all();
        this.widget.show();
        this.actor.opacity = 255;

        notification.widget.connect('destroy', Lang.bind(this, this._onWidgetDestroy));
    },

    _onWidgetDestroy: function() {
        let children = this._grid.get_children();

        if (children.length == 0)
            this.widget.hide();
    },

    _onNotificationDismissed: function() {
    }
};
Signals.addSignalMethods(NotificationManager.prototype);
