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
const Mainloop = imports.mainloop;
const Tweener = imports.util.tweener;

const Global = imports.global;
const MainToolbar = imports.mainToolbar;
const Preview = imports.preview;
const Searchbar = imports.searchbar;
const Selections = imports.selections;
const View = imports.view;
const WindowMode = imports.windowMode;

const Clutter = imports.gi.Clutter;
const EvView = imports.gi.EvinceView;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const GtkClutter = imports.gi.GtkClutter;
const _ = imports.gettext.gettext;

const _ICON_SIZE = 128;
const _PDF_LOADER_TIMEOUT = 400;

const SpinnerBox = new Lang.Class({
    Name: 'SpinnerBox',

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

        this._spinner = new Gtk.Spinner({ width_request: _ICON_SIZE,
                                          height_request: _ICON_SIZE,
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
        this.actor.raise_top();

        Tweener.addTween(this.actor, { opacity: 255,
                                       time: 0.30,
                                       transition: 'easeOutQuad' });
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
});

const ErrorBox = new Lang.Class({
    Name: 'ErrorBox',

    _init: function(primary, secondary) {
        this.widget = new Gtk.Grid({ orientation: Gtk.Orientation.VERTICAL,
                                     row_spacing: 12,
                                     hexpand: true,
                                     vexpand: true,
                                     halign: Gtk.Align.CENTER,
                                     valign: Gtk.Align.CENTER });

        this._image = new Gtk.Image({ pixel_size: _ICON_SIZE,
                                      icon_name: 'dialog-error',
                                      halign: Gtk.Align.CENTER,
                                      valign: Gtk.Align.CENTER });

        this.widget.add(this._image);

        this._primaryLabel =
            new Gtk.Label({ label: '',
                            use_markup: true,
                            halign: Gtk.Align.CENTER,
                            valign: Gtk.Align.CENTER });
        this.widget.add(this._primaryLabel);

        this._secondaryLabel =
            new Gtk.Label({ label: '',
                            use_markup: true,
                            halign: Gtk.Align.CENTER,
                            valign: Gtk.Align.CENTER });
        this.widget.add(this._secondaryLabel);

        this.widget.show_all();

        this.actor = new GtkClutter.Actor({ contents: this.widget,
                                            opacity: 255 });
    },

    update: function(primary, secondary) {
        let primaryMarkup = '<big><b>' + GLib.markup_escape_text(primary, -1) + '</b></big>';
        let secondaryMarkup = GLib.markup_escape_text(secondary, -1);

        this._primaryLabel.label = primaryMarkup;
        this._secondaryLabel.label = secondaryMarkup;
    },

    moveIn: function() {
        this.actor.raise_top();

        Tweener.addTween(this.actor, { opacity: 255,
                                       time: 0.30,
                                       transition: 'easeOutQuad' });
    },

    moveOut: function() {
        Tweener.addTween(this.actor, { opacity: 0,
                                       time: 0.30,
                                       transition: 'easeOutQuad',
                                       onComplete: function () {
                                           this.actor.lower_bottom();
                                       },
                                       onCompleteScope: this });
    }
});

const Embed = new Lang.Class({
    Name: 'Embed',

    _init: function() {
        this._queryErrorId = 0;

        this.widget = new GtkClutter.Embed({ use_layout_size: true });
        this.widget.show();

        // the embed is a vertical ClutterBox
        let stage = this.widget.get_stage();
        this._overlayLayout = new Clutter.BinLayout();
        this.actor = new Clutter.Box({ layout_manager: this._overlayLayout });
        this.actor.add_constraint(
            new Clutter.BindConstraint({ coordinate: Clutter.BindCoordinate.SIZE,
                                         source: stage }));
        stage.add_actor(this.actor);

        this._contentsLayout = new Clutter.BoxLayout({ vertical: true });
        this._contentsActor = new Clutter.Box({ layout_manager: this._contentsLayout });
        this._overlayLayout.add(this._contentsActor,
            Clutter.BinAlignment.FILL, Clutter.BinAlignment.FILL);

        // pack the main GtkNotebook and a spinnerbox in a BinLayout, so that
        // we can easily bring them front/back
        this._viewLayout = new Clutter.BinLayout();
        this._viewActor = new Clutter.Box({ layout_manager: this._viewLayout });
        this._contentsLayout.set_expand(this._viewActor, true);
        this._contentsLayout.set_fill(this._viewActor, true, true);
        this._contentsActor.add_actor(this._viewActor);

        this._notebook = new Gtk.Notebook({ show_tabs: false,
                                            show_border: false });
        this._notebook.show();
        this._notebookActor = new GtkClutter.Actor({ contents: this._notebook });
        this._viewLayout.add(this._notebookActor, Clutter.BinAlignment.FILL, Clutter.BinAlignment.FILL);

        this._spinnerBox = new SpinnerBox();
        this._viewLayout.add(this._spinnerBox.actor, Clutter.BinAlignment.FILL, Clutter.BinAlignment.FILL);
        this._spinnerBox.actor.lower_bottom();

        this._errorBox = new ErrorBox();
        this._viewLayout.add(this._errorBox.actor, Clutter.BinAlignment.FILL, Clutter.BinAlignment.FILL);
        this._errorBox.actor.lower_bottom();

        // also pack a white background to use for spotlights between window modes
        this._background =
            new Clutter.Rectangle({ color: new Clutter.Color ({ red: 255,
                                                                blue: 255,
                                                                green: 255,
                                                                alpha: 255 }) });
        this._viewLayout.add(this._background,
            Clutter.BinAlignment.FILL, Clutter.BinAlignment.FILL);
        this._background.lower_bottom();

        // create the OSD toolbar for selected items, it's hidden by default
        this._selectionToolbar = new Selections.SelectionToolbar(this._contentsActor);
        this._overlayLayout.add(this._selectionToolbar.actor,
            Clutter.BinAlignment.FIXED, Clutter.BinAlignment.FIXED);

        // pack the OSD notification actor
        this._viewLayout.add(Global.notificationManager.actor,
            Clutter.BinAlignment.CENTER, Clutter.BinAlignment.START);

        // now create the actual content widgets
        this._view = new View.ViewContainer();
        this._viewPage = this._notebook.append_page(this._view.widget, null);

        this._preview = new Preview.PreviewView();
        this._previewPage = this._notebook.append_page(this._preview.widget, null);

        Global.modeController.connect('window-mode-changed',
                                      Lang.bind(this, this._onWindowModeChanged));
        Global.modeController.connect('fullscreen-changed',
                                      Lang.bind(this, this._onFullscreenChanged));
        Global.trackerController.connect('query-status-changed',
                                         Lang.bind(this, this._onQueryStatusChanged));
        Global.trackerController.connect('query-error',
                                         Lang.bind(this, this._onQueryError));

        Global.documentManager.connect('active-changed',
                                       Lang.bind(this, this._onActiveItemChanged));
        Global.documentManager.connect('load-started',
                                       Lang.bind(this, this._onLoadStarted));
        Global.documentManager.connect('load-finished',
                                       Lang.bind(this, this._onLoadFinished));
        Global.documentManager.connect('load-error',
                                       Lang.bind(this, this._onLoadError));

        this._onQueryStatusChanged();
    },

    _onQueryStatusChanged: function() {
        let queryStatus = Global.trackerController.getQueryStatus();

        if (queryStatus) {
            this._errorBox.moveOut();
            this._spinnerBox.moveIn();
        } else {
            this._spinnerBox.moveOut();
        }
    },

    _onQueryError: function(manager, message, exception) {
        this._setError(message, exception.message);
    },

    _onFullscreenChanged: function(controller, fullscreen) {
        if (fullscreen) {
            this._previewFullscreen = new Preview.PreviewFullscreen(this._preview, this._overlayLayout, this._contentsActor);
        } else {
            this._previewFullscreen.destroy();
            this._previewFullscreen = null;
        }

        Gtk.Settings.get_default().gtk_application_prefer_dark_theme = fullscreen;
        this._toolbar.widget.visible = !fullscreen;
    },

    _moveOutBackground: function() {
        Tweener.addTween(this._background, { opacity: 0,
                                             time: 0.20,
                                             transition: 'easeInQuad',
                                             onComplete: function() {
                                                 this._background.lower_bottom();
                                             },
                                             onCompleteScope: this });
    },

    _windowModeChangeFlash: function() {
        // fade from white when returning to the view anyway
        this._background.raise_top();
        this._background.opacity = 255;
        this._moveOutBackground();
    },

    _onWindowModeChanged: function(object, newMode, oldMode) {
        if (newMode == WindowMode.WindowMode.OVERVIEW)
            this._prepareForOverview();
        else
            this._prepareForPreview();

        if (oldMode != WindowMode.WindowMode.NONE)
            this._windowModeChangeFlash();
    },

    _onActiveItemChanged: function(manager, doc) {
        let newMode = WindowMode.WindowMode.OVERVIEW;

        if (doc) {
            let collection = Global.collectionManager.getItemById(doc.id);
            if (!collection)
                newMode = WindowMode.WindowMode.PREVIEW;
        }

        Global.modeController.setWindowMode(newMode);
    },

    _onLoadStarted: function() {
        // switch to preview mode, and schedule the spinnerbox to
        // move in if the document is not loaded by the timeout
        this._spinnerBox.moveInDelayed(_PDF_LOADER_TIMEOUT);
    },

    _onLoadFinished: function(manager, doc, docModel) {
        this._toolbar.setModel(docModel);
        this._preview.setModel(docModel);
        this._preview.widget.grab_focus();

        this._spinnerBox.moveOut();
        Global.modeController.setCanFullscreen(true);
    },

    _onLoadError: function(manager, doc, message, exception) {
        this._spinnerBox.moveOut();
        this._setError(message, exception.message);
    },

    _prepareForOverview: function() {
        if (this._preview)
            this._preview.setModel(null);

        if (this._toolbar)
            this._toolbar.actor.destroy();

        // pack the toolbar
        this._toolbar = new MainToolbar.OverviewToolbar(this._viewLayout);
        this._contentsLayout.pack_start = true;
        this._contentsActor.add_actor(this._toolbar.actor);
        this._contentsLayout.set_fill(this._toolbar.actor, true, false);

        this._spinnerBox.moveOut();
        this._errorBox.moveOut();

        this._notebook.set_current_page(this._viewPage);
    },

    _prepareForPreview: function() {
        if (this._toolbar)
            this._toolbar.actor.destroy();

        // pack the toolbar
        this._toolbar = new Preview.PreviewToolbar(this._preview);
        this._contentsLayout.pack_start = true;
        this._contentsActor.add_actor(this._toolbar.actor);
        this._contentsLayout.set_fill(this._toolbar.actor, true, false);

        this._notebook.set_current_page(this._previewPage);
    },

    _setError: function(primary, secondary) {
        this._errorBox.update(primary, secondary);
        this._errorBox.moveIn();
    },

    getMainToolbar: function(event) {
        return this._toolbar;
    }
});
